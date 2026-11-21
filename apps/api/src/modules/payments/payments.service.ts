import type { z } from 'zod';
import { can, formatMoney, type PaymentListQuery, type paymentInputSchema } from '@pulse/shared';
import type { Payment } from '@prisma/client';
import { Prisma, prisma } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { conflict, forbidden, unprocessable } from '../../utils/errors';
import { paginate } from '../../utils/http';
import { audit } from '../audit/audit.service';
import { notifyRoles } from '../notifications/notifications.service';
import { lockOrder } from '../orders/order-lock';

type PaymentCreate = z.output<typeof paymentInputSchema>;

const PAYABLE = new Set(['CONFIRMED', 'FULFILLED', 'COMPLETED']);

function sameRequest(p: Payment, orderId: string, input: PaymentCreate) {
  return p.orderId === orderId && p.kind === input.kind && p.amountCents === input.amountCents && p.method === input.method;
}

/**
 * Records a payment or refund against an order. Amounts are validated against the
 * order's committed balance while holding its row lock, so two people recording
 * payments at once cannot overpay it. The idempotency key makes client retries safe.
 */
export async function recordPayment(ctx: OrgContext, orderId: string, input: PaymentCreate): Promise<{ payment: Payment; replayed: boolean }> {
  if (input.kind === 'REFUND' && !can(ctx.role, 'payments:refund')) throw forbidden('Only owners and admins can record refunds');
  if (input.kind === 'PAYMENT' && !can(ctx.role, 'payments:record')) throw forbidden('You cannot record payments');

  const replay = await prisma.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey: input.idempotencyKey } } });
  if (replay) {
    if (!sameRequest(replay, orderId, input)) throw conflict('This idempotency key was already used for a different payment');
    return { payment: replay, replayed: true };
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, ctx.organizationId, orderId);
      const net = order.paidCents - order.refundedCents;

      if (input.kind === 'PAYMENT') {
        if (!PAYABLE.has(order.status)) {
          throw unprocessable('ORDER_NOT_PAYABLE', order.status === 'DRAFT' ? 'Confirm the order before recording payments' : 'Payments cannot be recorded on a cancelled order');
        }
        const remaining = order.totalCents - net;
        if (input.amountCents > remaining) {
          throw unprocessable('OVERPAYMENT', remaining === 0 ? 'This order is already paid in full' : `Amount exceeds the outstanding balance of ${formatMoney(remaining)}`, { outstandingCents: remaining });
        }
      } else {
        if (input.amountCents > net) {
          throw unprocessable('REFUND_EXCEEDS_PAID', net === 0 ? 'Nothing has been paid on this order to refund' : `Refund cannot exceed the ${formatMoney(net)} collected`, { refundableCents: net });
        }
      }

      if (input.reference) {
        const dup = await tx.payment.findFirst({ where: { organizationId: ctx.organizationId, orderId, kind: input.kind, reference: input.reference } });
        if (dup) throw conflict(`A ${input.kind.toLowerCase()} with reference "${input.reference}" is already recorded on this order`);
      }

      const created = await tx.payment.create({
        data: {
          organizationId: ctx.organizationId,
          orderId,
          recordedById: ctx.userId,
          kind: input.kind,
          method: input.method,
          amountCents: input.amountCents,
          reference: input.reference ?? null,
          note: input.note ?? null,
          idempotencyKey: input.idempotencyKey,
          receivedAt: input.receivedAt ?? new Date(),
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: input.kind === 'PAYMENT' ? { paidCents: { increment: input.amountCents } } : { refundedCents: { increment: input.amountCents } },
      });
      const verb = input.kind === 'PAYMENT' ? 'Recorded payment' : 'Recorded refund';
      await audit(tx, ctx, {
        action: input.kind === 'PAYMENT' ? 'payment.recorded' : 'payment.refunded',
        entityType: 'Order',
        entityId: orderId,
        summary: `${verb} of ${formatMoney(input.amountCents)} on order #${order.number}`,
        metadata: { paymentId: created.id, amountCents: input.amountCents, method: input.method, reference: input.reference ?? null },
      });
      await notifyRoles(tx, ctx.organizationId, ['OWNER', 'ADMIN'], {
        type: 'PAYMENT_RECORDED',
        title: `${verb}: ${formatMoney(input.amountCents)}`,
        body: `Order #${order.number} via ${input.method.replace('_', ' ').toLowerCase()}.`,
        link: `/app/orders/${orderId}`,
      }, ctx.userId);
      return created;
    });
    return { payment, replayed: false };
  } catch (err) {
    // Two identical requests raced past the replay check; the unique index decided.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.payment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey: input.idempotencyKey } } });
      if (existing && sameRequest(existing, orderId, input)) return { payment: existing, replayed: true };
      throw conflict('This idempotency key was already used for a different payment');
    }
    throw err;
  }
}

export async function listPayments(ctx: OrgContext, q: PaymentListQuery) {
  const where: Prisma.PaymentWhereInput = {
    organizationId: ctx.organizationId,
    ...(q.kind ? { kind: q.kind } : {}),
    ...(q.method ? { method: q.method } : {}),
    ...(q.from || q.to ? { receivedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    ...(q.q
      ? {
          OR: [
            { reference: { contains: q.q, mode: 'insensitive' } },
            { order: { customer: { name: { contains: q.q, mode: 'insensitive' } } } },
            ...(Number.isInteger(Number(q.q.replace(/^#/, ''))) && Number(q.q.replace(/^#/, '')) > 0 ? [{ order: { number: Number(q.q.replace(/^#/, '')) } }] : []),
          ],
        }
      : {}),
  };
  const [rows, total, sums] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        recordedBy: { select: { id: true, name: true } },
        order: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({ by: ['kind'], where, _sum: { amountCents: true }, orderBy: { kind: 'asc' } }),
  ]);
  const sum = (kind: 'PAYMENT' | 'REFUND') => sums.find((s) => s.kind === kind)?._sum?.amountCents ?? 0;
  return { ...paginate(rows, total, q.page, q.pageSize), totals: { collectedCents: sum('PAYMENT'), refundedCents: sum('REFUND') } };
}

