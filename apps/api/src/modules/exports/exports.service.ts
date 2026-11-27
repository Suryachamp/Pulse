import { centsToDecimal, derivePaymentStatus, outstandingCents, toCsv, type CsvCell } from '@pulse/shared';
import { Prisma, prisma } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { unprocessable } from '../../utils/errors';
import { audit } from '../audit/audit.service';
import { rowInvoiceStatus } from '../orders/invoice.service';

export type Dataset = 'orders' | 'customers' | 'payments';
export interface ExportRange { from?: Date; to?: Date }

/** Exports are built in memory; past this size the caller should narrow the date range. */
export const EXPORT_ROW_LIMIT = 50_000;

const money = centsToDecimal;

function within(range: ExportRange) {
  return range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } : undefined;
}

function assertSize(count: number) {
  if (count > EXPORT_ROW_LIMIT) {
    throw unprocessable('EXPORT_TOO_LARGE', `This export has ${count.toLocaleString('en-US')} rows. Narrow the date range to under ${EXPORT_ROW_LIMIT.toLocaleString('en-US')}.`, { count, limit: EXPORT_ROW_LIMIT });
  }
}

async function ordersCsv(ctx: OrgContext, range: ExportRange) {
  const where: Prisma.OrderWhereInput = { organizationId: ctx.organizationId, createdAt: within(range) };
  assertSize(await prisma.order.count({ where }));
  const [orders, org] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { number: 'asc' },
      include: { customer: { select: { name: true, company: true } }, _count: { select: { items: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { paymentTermsDays: true } }),
  ]);
  const header = ['number', 'status', 'payment_status', 'invoice_status', 'customer', 'company', 'created_at', 'confirmed_at', 'fulfilled_at', 'completed_at', 'cancelled_at', 'items', 'subtotal', 'discount', 'tax_rate_percent', 'tax', 'total', 'paid', 'refunded', 'balance'];
  const rows = orders.map((o): CsvCell[] => {
    const balance = outstandingCents(o.status, o.totalCents, o.paidCents, o.refundedCents);
    return [
      o.number, o.status, derivePaymentStatus(o.totalCents, o.paidCents, o.refundedCents), rowInvoiceStatus(o, balance, org.paymentTermsDays),
      o.customer.name, o.customer.company, o.createdAt, o.confirmedAt, o.fulfilledAt, o.completedAt, o.cancelledAt, o._count.items,
      money(o.subtotalCents), money(o.discountCents), (o.taxRateBps / 100).toFixed(2), money(o.taxCents), money(o.totalCents),
      money(o.paidCents), money(o.refundedCents), money(balance),
    ];
  });
  return { csv: toCsv(header, rows), count: rows.length };
}

/** Same definitions as the customer list: booked orders only, no drafts or cancellations. */
async function customersCsv(ctx: OrgContext) {
  assertSize(await prisma.customer.count({ where: { organizationId: ctx.organizationId } }));
  const customers = await prisma.$queryRaw<{
    name: string; email: string | null; phone: string | null; company: string | null; address: string | null; tags: string[];
    archivedAt: Date | null; createdAt: Date; orderCount: number; totalSpentCents: number; outstandingCents: number; lastOrderAt: Date | null;
  }[]>`
    SELECT c."name", c."email", c."phone", c."company", c."address", c."tags", c."archivedAt", c."createdAt",
           COALESCE(s."orderCount", 0)::int AS "orderCount",
           COALESCE(s."totalSpentCents", 0)::bigint::int AS "totalSpentCents",
           COALESCE(s."outstandingCents", 0)::bigint::int AS "outstandingCents",
           s."lastOrderAt"
    FROM "Customer" c
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "orderCount",
             SUM(o."totalCents") AS "totalSpentCents",
             SUM(GREATEST(o."totalCents" - (o."paidCents" - o."refundedCents"), 0)) AS "outstandingCents",
             MAX(o."createdAt") AS "lastOrderAt"
      FROM "Order" o
      WHERE o."customerId" = c."id" AND o."organizationId" = c."organizationId"
        AND o."status" NOT IN ('DRAFT', 'CANCELLED')
    ) s ON TRUE
    WHERE c."organizationId" = ${ctx.organizationId}::uuid
    ORDER BY c."name", c."id"`;
  const header = ['name', 'email', 'phone', 'company', 'address', 'tags', 'status', 'created_at', 'orders', 'lifetime_value', 'outstanding', 'last_order_at'];
  const rows = customers.map((c): CsvCell[] => [
    c.name, c.email, c.phone, c.company, c.address, c.tags.join('; '), c.archivedAt ? 'archived' : 'active', c.createdAt,
    c.orderCount, money(c.totalSpentCents), money(c.outstandingCents), c.lastOrderAt,
  ]);
  return { csv: toCsv(header, rows), count: rows.length };
}

/** Refunds are negative so the amount column sums to net cash received. */
async function paymentsCsv(ctx: OrgContext, range: ExportRange) {
  const where: Prisma.PaymentWhereInput = { organizationId: ctx.organizationId, receivedAt: within(range) };
  assertSize(await prisma.payment.count({ where }));
  const payments = await prisma.payment.findMany({
    where,
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    include: { order: { select: { number: true, customer: { select: { name: true } } } }, recordedBy: { select: { name: true } } },
  });
  const header = ['received_at', 'kind', 'method', 'amount', 'order_number', 'customer', 'reference', 'note', 'recorded_by'];
  const rows = payments.map((p): CsvCell[] => [
    p.receivedAt, p.kind, p.method, money(p.kind === 'REFUND' ? -p.amountCents : p.amountCents),
    p.order.number, p.order.customer.name, p.reference, p.note, p.recordedBy?.name,
  ]);
  return { csv: toCsv(header, rows), count: rows.length };
}

export async function exportDataset(ctx: OrgContext, dataset: Dataset, range: ExportRange) {
  const { csv, count } = dataset === 'orders' ? await ordersCsv(ctx, range) : dataset === 'customers' ? await customersCsv(ctx) : await paymentsCsv(ctx, range);
  await prisma.$transaction((tx) =>
    audit(tx, ctx, {
      action: 'data.exported',
      entityType: 'Organization',
      entityId: ctx.organizationId,
      summary: `Exported ${dataset} (${count} row${count === 1 ? '' : 's'})`,
      metadata: { dataset, rows: count, ...(range.from ? { from: range.from.toISOString() } : {}), ...(range.to ? { to: range.to.toISOString() } : {}) },
    }),
  );
  return csv;
}
