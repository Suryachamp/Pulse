import { invoiceDueDate, invoiceStatus, outstandingCents, type OrderStatus } from '@pulse/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { AppError, notFound } from '../../utils/errors';

/**
 * A customer-facing view of an order. It is assembled on request rather than stored,
 * so it always reflects the latest payments and the seller details in Settings.
 * Internal fields (order notes, payment notes, who recorded what) are left out.
 */
export async function getInvoice(ctx: OrgContext, orderId: string) {
  const [order, org] = await Promise.all([
    prisma.order.findFirst({
      where: { id: orderId, organizationId: ctx.organizationId },
      include: {
        customer: { select: { name: true, company: true, email: true, phone: true, address: true } },
        items: { orderBy: { productName: 'asc' }, select: { id: true, productName: true, sku: true, unitPriceCents: true, quantity: true, lineTotalCents: true } },
        payments: { orderBy: { receivedAt: 'asc' }, select: { id: true, kind: true, method: true, amountCents: true, reference: true, receivedAt: true } },
      },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true, currency: true, invoiceAddress: true, invoiceEmail: true, invoicePhone: true, invoiceTaxId: true, invoiceFooter: true, paymentTermsDays: true },
    }),
  ]);
  if (!order) throw notFound('Order');
  if (order.status === 'DRAFT' || !order.confirmedAt) {
    throw new AppError(409, 'INVOICE_NOT_AVAILABLE', 'Confirm the order before issuing an invoice');
  }

  const issuedAt = order.confirmedAt;
  const dueAt = invoiceDueDate(issuedAt, org.paymentTermsDays);
  const balanceDueCents = outstandingCents(order.status, order.totalCents, order.paidCents, order.refundedCents);

  return {
    id: order.id,
    number: order.number,
    orderStatus: order.status,
    invoiceStatus: invoiceStatus(order.status, balanceDueCents, dueAt),
    issuedAt,
    dueAt,
    paymentTermsDays: org.paymentTermsDays,
    cancelledAt: order.cancelledAt,
    currency: org.currency,
    seller: {
      name: org.name,
      address: org.invoiceAddress,
      email: org.invoiceEmail,
      phone: org.invoicePhone,
      taxId: org.invoiceTaxId,
      footer: org.invoiceFooter,
    },
    customer: order.customer,
    items: order.items,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    taxRateBps: order.taxRateBps,
    taxCents: order.taxCents,
    totalCents: order.totalCents,
    paidCents: order.paidCents,
    refundedCents: order.refundedCents,
    balanceDueCents,
    payments: order.payments,
  };
}

/**
 * SQL for "invoice is overdue": issued (confirmed, not cancelled), a balance remains,
 * and confirmation + the organization's payment terms is in the past. Mirrors the
 * shared `invoiceStatus` rule so the list filter, badges and dashboard always agree.
 */
const OVERDUE_SQL = Prisma.sql`
  FROM "Order" o JOIN "Organization" g ON g."id" = o."organizationId"
  WHERE o."status" IN ('CONFIRMED','FULFILLED','COMPLETED')
    AND o."totalCents" > o."paidCents" - o."refundedCents"
    AND o."confirmedAt" + make_interval(days => g."paymentTermsDays") < now()`;

export async function overdueOrderIds(organizationId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT o."id" ${OVERDUE_SQL} AND o."organizationId" = ${organizationId}::uuid`;
  return rows.map((r) => r.id);
}

export async function overdueSummary(organizationId: string) {
  const [row] = await prisma.$queryRaw<{ count: number; cents: number }[]>`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(o."totalCents" - (o."paidCents" - o."refundedCents")), 0)::bigint::int AS cents
    ${OVERDUE_SQL} AND o."organizationId" = ${organizationId}::uuid`;
  return { count: row?.count ?? 0, cents: row?.cents ?? 0 };
}

/** Invoice status for a list row; null for drafts, which have no invoice yet. */
export function rowInvoiceStatus(o: { status: OrderStatus; confirmedAt: Date | null }, balanceCents: number, paymentTermsDays: number) {
  if (o.status === 'DRAFT' || !o.confirmedAt) return null;
  return invoiceStatus(o.status, balanceCents, invoiceDueDate(o.confirmedAt, paymentTermsDays));
}
