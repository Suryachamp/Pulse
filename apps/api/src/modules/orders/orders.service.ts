import type { z } from 'zod';
import {
  calculateOrderTotals,
  can,
  canTransition,
  derivePaymentStatus,
  outstandingCents,
  ORDER_TRANSITIONS,
  type OrderListQuery,
  type OrderTransitionInput,
  type PaymentStatus,
  type orderInputSchema,
} from '@pulse/shared';
import type { Order, OrderStatus } from '@prisma/client';
import { Prisma, prisma, type Tx } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { paginate } from '../../utils/http';
import { audit } from '../audit/audit.service';
import { applyStockChanges } from '../inventory/stock';
import { notifyUsers } from '../notifications/notifications.service';
import { lockOrder } from './order-lock';
import { overdueOrderIds, rowInvoiceStatus } from './invoice.service';

type OrderCreate = z.output<typeof orderInputSchema>;

export function withPaymentInfo<T extends Pick<Order, 'status' | 'totalCents' | 'paidCents' | 'refundedCents'>>(o: T) {
  return {
    ...o,
    paymentStatus: derivePaymentStatus(o.totalCents, o.paidCents, o.refundedCents),
    outstandingCents: outstandingCents(o.status, o.totalCents, o.paidCents, o.refundedCents),
  };
}

const PAYMENT_STATUS_WHERE: Record<PaymentStatus, Prisma.OrderWhereInput> = {
  UNPAID: { refundedCents: 0, paidCents: 0 },
  PARTIALLY_PAID: { refundedCents: 0, paidCents: { gt: 0, lt: prisma.order.fields.totalCents } },
  PAID: { refundedCents: 0, paidCents: { gt: 0, gte: prisma.order.fields.totalCents } },
  PARTIALLY_REFUNDED: { refundedCents: { gt: 0, lt: prisma.order.fields.paidCents } },
  REFUNDED: { refundedCents: { gt: 0, equals: prisma.order.fields.paidCents } },
};

export async function listOrders(ctx: OrgContext, q: OrderListQuery) {
  const and: Prisma.OrderWhereInput[] = [{ organizationId: ctx.organizationId }];
  if (q.status) and.push({ status: q.status });
  if (q.customerId) and.push({ customerId: q.customerId });
  if (q.paymentStatus) and.push(PAYMENT_STATUS_WHERE[q.paymentStatus]);
  if (q.overdue) and.push({ id: { in: await overdueOrderIds(ctx.organizationId) } });
  if (q.q) {
    const n = Number(q.q.replace(/^#/, ''));
    and.push({
      OR: [
        ...(Number.isInteger(n) && n > 0 && n < 2 ** 31 ? [{ number: n }] : []),
        { customer: { name: { contains: q.q, mode: 'insensitive' } } },
        { customer: { company: { contains: q.q, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.OrderWhereInput = { AND: and };
  const [rows, total, org] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: [{ [q.sort]: q.dir }, { id: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { customer: { select: { id: true, name: true, company: true } }, _count: { select: { items: true } } },
    }),
    prisma.order.count({ where }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { paymentTermsDays: true } }),
  ]);
  const data = rows.map((r) => {
    const o = withPaymentInfo(r);
    return { ...o, invoiceStatus: rowInvoiceStatus(o, o.outstandingCents, org.paymentTermsDays) };
  });
  return paginate(data, total, q.page, q.pageSize);
}

export async function getOrder(ctx: OrgContext, id: string) {
  const order = await prisma.order.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      customer: { select: { id: true, name: true, email: true, company: true, phone: true } },
      createdBy: { select: { id: true, name: true } },
      items: { orderBy: { productName: 'asc' } },
      payments: { orderBy: { receivedAt: 'desc' }, include: { recordedBy: { select: { id: true, name: true } } } },
    },
  });
  if (!order) throw notFound('Order');
  const history = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId, entityType: 'Order', entityId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { id: true, name: true } } },
  });
  return { ...withPaymentInfo(order), allowedTransitions: ORDER_TRANSITIONS[order.status], history };
}

/** Resolves catalog prices on the server and snapshots them onto the items. */
async function buildItems(tx: Tx, ctx: OrgContext, items: OrderCreate['items']) {
  const products = await tx.product.findMany({
    where: { organizationId: ctx.organizationId, id: { in: items.map((i) => i.productId) } },
    select: { id: true, name: true, sku: true, priceCents: true, archivedAt: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw badRequest('One of the selected products no longer exists', { fields: { items: ['Unknown product'] }, productId: i.productId });
    if (p.archivedAt) throw badRequest(`${p.name} is archived and cannot be ordered`, { productId: p.id });
    return { productId: p.id, productName: p.name, sku: p.sku, unitPriceCents: p.priceCents, quantity: i.quantity, lineTotalCents: p.priceCents * i.quantity };
  });
}

async function assertCustomer(tx: Tx, ctx: OrgContext, customerId: string) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, organizationId: ctx.organizationId }, select: { id: true, name: true, archivedAt: true } });
  if (!customer) throw badRequest('Customer not found', { fields: { customerId: ['Select a valid customer'] } });
  if (customer.archivedAt) throw badRequest(`${customer.name} is archived. Restore them before creating orders.`);
  return customer;
}

export async function createOrder(ctx: OrgContext, input: OrderCreate) {
  return prisma.$transaction(async (tx) => {
    const customer = await assertCustomer(tx, ctx, input.customerId);
    const items = await buildItems(tx, ctx, input.items);
    const org = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { orderSequence: { increment: 1 } },
      select: { orderSequence: true, defaultTaxRateBps: true },
    });
    const taxRateBps = input.taxRateBps ?? org.defaultTaxRateBps;
    const totals = calculateOrderTotals({ items, discountCents: input.discountCents, taxRateBps });
    const order = await tx.order.create({
      data: {
        organizationId: ctx.organizationId,
        number: org.orderSequence,
        customerId: customer.id,
        createdById: ctx.userId,
        notes: input.notes ?? null,
        taxRateBps,
        ...totals,
        items: { create: items },
      },
    });
    await audit(tx, ctx, {
      action: 'order.created',
      entityType: 'Order',
      entityId: order.id,
      summary: `Created draft order #${order.number} for ${customer.name}`,
      metadata: { totalCents: order.totalCents, itemCount: items.length },
    });
    return order;
  });
}

export async function updateDraft(ctx: OrgContext, id: string, input: OrderCreate) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockOrder(tx, ctx.organizationId, id);
    if (locked.status !== 'DRAFT') throw conflict('Only draft orders can be edited');
    const customer = await assertCustomer(tx, ctx, input.customerId);
    const items = await buildItems(tx, ctx, input.items);
    const taxRateBps = input.taxRateBps ?? (await tx.order.findUniqueOrThrow({ where: { id }, select: { taxRateBps: true } })).taxRateBps;
    const totals = calculateOrderTotals({ items, discountCents: input.discountCents, taxRateBps });
    await tx.orderItem.deleteMany({ where: { orderId: id, organizationId: ctx.organizationId } });
    const order = await tx.order.update({
      where: { id },
      data: {
        customerId: customer.id,
        notes: input.notes ?? null,
        taxRateBps,
        ...totals,
        items: { create: items },
      },
    });
    await audit(tx, ctx, { action: 'order.updated', entityType: 'Order', entityId: id, summary: `Edited draft order #${order.number}`, metadata: { totalCents: order.totalCents } });
    return order;
  });
}

const TIMESTAMP: Partial<Record<OrderStatus, 'confirmedAt' | 'fulfilledAt' | 'completedAt' | 'cancelledAt'>> = {
  CONFIRMED: 'confirmedAt',
  FULFILLED: 'fulfilledAt',
  COMPLETED: 'completedAt',
  CANCELLED: 'cancelledAt',
};

const VERB: Record<OrderStatus, string> = { DRAFT: 'drafted', CONFIRMED: 'confirmed', FULFILLED: 'fulfilled', COMPLETED: 'completed', CANCELLED: 'cancelled' };

export async function transitionOrder(ctx: OrgContext, id: string, input: OrderTransitionInput) {
  const to = input.status;
  if (to === 'CANCELLED' && !can(ctx.role, 'orders:cancel')) throw forbidden('Only managers and above can cancel orders');

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, ctx.organizationId, id);
    if (!canTransition(order.status, to)) {
      throw conflict(`An order that is ${order.status.toLowerCase()} cannot be moved to ${to.toLowerCase()}`, {
        code: 'INVALID_TRANSITION',
        from: order.status,
        to,
        allowed: ORDER_TRANSITIONS[order.status],
      });
    }
    const items = await tx.orderItem.findMany({ where: { orderId: id, organizationId: ctx.organizationId } });
    const base = { orderId: id };

    if (to === 'CONFIRMED') {
      const archived = await tx.product.findFirst({ where: { organizationId: ctx.organizationId, id: { in: items.map((i) => i.productId) }, archivedAt: { not: null } }, select: { name: true } });
      if (archived) throw conflict(`${archived.name} has been archived. Edit the draft to remove it before confirming.`);
      await applyStockChanges(tx, ctx, items.map((i) => ({ ...base, productId: i.productId, onHandDelta: 0, reservedDelta: i.quantity, type: 'RESERVE' as const, reason: `Reserved for order #${order.number}` })));
    } else if (to === 'FULFILLED') {
      await applyStockChanges(tx, ctx, items.map((i) => ({ ...base, productId: i.productId, onHandDelta: -i.quantity, reservedDelta: -i.quantity, type: 'FULFILL' as const, reason: `Shipped on order #${order.number}` })));
    } else if (to === 'CANCELLED' && order.status === 'CONFIRMED') {
      await applyStockChanges(tx, ctx, items.map((i) => ({ ...base, productId: i.productId, onHandDelta: 0, reservedDelta: -i.quantity, type: 'RELEASE' as const, reason: `Released from cancelled order #${order.number}` })));
    }

    const stamp = TIMESTAMP[to];
    const updated = await tx.order.update({
      where: { id },
      data: { status: to, ...(stamp ? { [stamp]: new Date() } : {}), ...(to === 'CANCELLED' ? { cancelReason: input.reason ?? null } : {}) },
    });

    await audit(tx, ctx, {
      action: `order.${to.toLowerCase()}`,
      entityType: 'Order',
      entityId: id,
      summary: `Order #${order.number} ${VERB[to]}${to === 'CANCELLED' && input.reason ? `: ${input.reason}` : ''}`,
      metadata: { from: order.status, to, ...(input.reason ? { reason: input.reason } : {}) },
    });
    if (order.createdById && order.createdById !== ctx.userId) {
      await notifyUsers(tx, ctx.organizationId, [order.createdById], {
        type: 'ORDER_STATUS',
        title: `Order #${order.number} ${VERB[to]}`,
        body: `Moved from ${order.status.toLowerCase()} to ${to.toLowerCase()}.`,
        link: `/app/orders/${id}`,
      });
    }
    return withPaymentInfo(updated);
  });
}
