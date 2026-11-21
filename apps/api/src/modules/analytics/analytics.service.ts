import { Prisma, prisma } from '../../database/prisma';
import type { OrgContext } from '../../types/express';

export interface Range {
  from: Date;
  to: Date;
}

/**
 * Definitions used everywhere in PULSE:
 *  - Booked sales: totals of orders confirmed in the range that were not later cancelled.
 *  - Collected: payments received in the range. Refunded: refunds issued in the range.
 *  - Net revenue: collected - refunded (cash basis).
 *  - Outstanding: what customers currently owe on live (confirmed/fulfilled/completed) orders.
 */
async function periodMetrics(orgId: string, { from, to }: Range) {
  const [orders] = await prisma.$queryRaw<{ count: number; booked: number }[]>`
    SELECT COUNT(*)::int AS count, COALESCE(SUM("totalCents"), 0)::bigint::int AS booked
    FROM "Order"
    WHERE "organizationId" = ${orgId}::uuid AND "confirmedAt" BETWEEN ${from} AND ${to} AND "status" <> 'CANCELLED'`;
  const [cash] = await prisma.$queryRaw<{ collected: number; refunded: number; paymentCount: number }[]>`
    SELECT COALESCE(SUM("amountCents") FILTER (WHERE "kind" = 'PAYMENT'), 0)::bigint::int AS collected,
           COALESCE(SUM("amountCents") FILTER (WHERE "kind" = 'REFUND'), 0)::bigint::int AS refunded,
           COUNT(*) FILTER (WHERE "kind" = 'PAYMENT')::int AS "paymentCount"
    FROM "Payment"
    WHERE "organizationId" = ${orgId}::uuid AND "receivedAt" BETWEEN ${from} AND ${to}`;
  const [cancelled] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "Order"
    WHERE "organizationId" = ${orgId}::uuid AND "cancelledAt" BETWEEN ${from} AND ${to}`;
  const orderCount = orders?.count ?? 0;
  const booked = orders?.booked ?? 0;
  const collected = cash?.collected ?? 0;
  const refunded = cash?.refunded ?? 0;
  return {
    orderCount,
    bookedSalesCents: booked,
    averageOrderCents: orderCount ? Math.round(booked / orderCount) : 0,
    collectedCents: collected,
    refundedCents: refunded,
    netRevenueCents: collected - refunded,
    paymentCount: cash?.paymentCount ?? 0,
    cancelledCount: cancelled?.count ?? 0,
  };
}

export function previousRange({ from, to }: Range): Range {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) };
}

export async function outstanding(orgId: string) {
  const [row] = await prisma.$queryRaw<{ cents: number; orders: number }[]>`
    SELECT COALESCE(SUM("totalCents" - ("paidCents" - "refundedCents")), 0)::bigint::int AS cents,
           COUNT(*) FILTER (WHERE "totalCents" > "paidCents" - "refundedCents")::int AS orders
    FROM "Order"
    WHERE "organizationId" = ${orgId}::uuid AND "status" IN ('CONFIRMED', 'FULFILLED', 'COMPLETED')`;
  return { outstandingCents: row?.cents ?? 0, ordersWithBalance: row?.orders ?? 0 };
}

export async function summary(ctx: OrgContext, range: Range) {
  const prev = previousRange(range);
  const [current, previous, owed] = await Promise.all([periodMetrics(ctx.organizationId, range), periodMetrics(ctx.organizationId, prev), outstanding(ctx.organizationId)]);
  return { range, previousRange: prev, current, previous, ...owed };
}

export async function timeseries(ctx: OrgContext, { from, to }: Range) {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  const unit = days > 120 ? 'week' : 'day';
  const step = unit === 'week' ? Prisma.sql`interval '1 week'` : Prisma.sql`interval '1 day'`;
  const trunc = Prisma.raw(`'${unit}'`);
  const rows = await prisma.$queryRaw<{ bucket: Date; booked: number; collected: number; refunded: number; orders: number }[]>`
    WITH buckets AS (
      SELECT generate_series(date_trunc(${trunc}, ${from}::timestamp), ${to}::timestamp, ${step}) AS bucket
    ),
    o AS (
      SELECT date_trunc(${trunc}, "confirmedAt") AS bucket, SUM("totalCents") AS booked, COUNT(*) AS orders
      FROM "Order"
      WHERE "organizationId" = ${ctx.organizationId}::uuid AND "confirmedAt" BETWEEN ${from} AND ${to} AND "status" <> 'CANCELLED'
      GROUP BY 1
    ),
    p AS (
      SELECT date_trunc(${trunc}, "receivedAt") AS bucket,
             SUM("amountCents") FILTER (WHERE "kind" = 'PAYMENT') AS collected,
             SUM("amountCents") FILTER (WHERE "kind" = 'REFUND') AS refunded
      FROM "Payment"
      WHERE "organizationId" = ${ctx.organizationId}::uuid AND "receivedAt" BETWEEN ${from} AND ${to}
      GROUP BY 1
    )
    SELECT b.bucket,
           COALESCE(o.booked, 0)::bigint::int AS booked,
           COALESCE(o.orders, 0)::int AS orders,
           COALESCE(p.collected, 0)::bigint::int AS collected,
           COALESCE(p.refunded, 0)::bigint::int AS refunded
    FROM buckets b
    LEFT JOIN o ON o.bucket = b.bucket
    LEFT JOIN p ON p.bucket = b.bucket
    ORDER BY b.bucket`;
  return { unit, points: rows.map((r) => ({ ...r, bucket: r.bucket.toISOString().slice(0, 10), net: r.collected - r.refunded })) };
}

export async function ordersByStatus(ctx: OrgContext, range: Range) {
  const rows = await prisma.order.groupBy({
    by: ['status'],
    where: { organizationId: ctx.organizationId, createdAt: { gte: range.from, lte: range.to } },
    _count: true,
    _sum: { totalCents: true },
    orderBy: { status: 'asc' },
  });
  return rows.map((r) => ({ status: r.status, count: r._count, totalCents: r._sum?.totalCents ?? 0 }));
}

export async function topProducts(ctx: OrgContext, range: Range, limit = 8) {
  return prisma.$queryRaw<{ productId: string; name: string; sku: string; units: number; revenueCents: number; available: number }[]>`
    SELECT i."productId", p."name", p."sku",
           SUM(i."quantity")::int AS units, SUM(i."lineTotalCents")::bigint::int AS "revenueCents",
           (p."onHand" - p."reserved")::int AS available
    FROM "OrderItem" i
    JOIN "Order" o ON o."id" = i."orderId" AND o."organizationId" = i."organizationId"
    JOIN "Product" p ON p."id" = i."productId" AND p."organizationId" = i."organizationId"
    WHERE i."organizationId" = ${ctx.organizationId}::uuid AND o."status" IN ('FULFILLED','COMPLETED')
      AND o."fulfilledAt" BETWEEN ${range.from} AND ${range.to}
    GROUP BY i."productId", p."name", p."sku", p."onHand", p."reserved"
    ORDER BY "revenueCents" DESC
    LIMIT ${limit}`;
}

export async function inventoryHealth(ctx: OrgContext) {
  const [row] = await prisma.$queryRaw<{ products: number; units: number; reserved: number; costValue: number; retailValue: number; low: number; out: number }[]>`
    SELECT COUNT(*)::int AS products,
           COALESCE(SUM("onHand"), 0)::int AS units,
           COALESCE(SUM("reserved"), 0)::int AS reserved,
           COALESCE(SUM("onHand"::bigint * COALESCE("costCents", 0)), 0)::bigint::int AS "costValue",
           COALESCE(SUM("onHand"::bigint * "priceCents"), 0)::bigint::int AS "retailValue",
           COUNT(*) FILTER (WHERE "onHand" - "reserved" <= "lowStockThreshold" AND "onHand" - "reserved" > 0)::int AS low,
           COUNT(*) FILTER (WHERE "onHand" - "reserved" <= 0)::int AS out
    FROM "Product" WHERE "organizationId" = ${ctx.organizationId}::uuid AND "archivedAt" IS NULL`;
  return row;
}

/** Receivables aging, measured from when the order was confirmed. */
export async function receivablesAging(ctx: OrgContext) {
  const rows = await prisma.$queryRaw<{ bucket: string; cents: number; orders: number }[]>`
    SELECT CASE
             WHEN now() - "confirmedAt" <= interval '30 days' THEN '0-30'
             WHEN now() - "confirmedAt" <= interval '60 days' THEN '31-60'
             WHEN now() - "confirmedAt" <= interval '90 days' THEN '61-90'
             ELSE '90+'
           END AS bucket,
           SUM("totalCents" - ("paidCents" - "refundedCents"))::bigint::int AS cents,
           COUNT(*)::int AS orders
    FROM "Order"
    WHERE "organizationId" = ${ctx.organizationId}::uuid AND "status" IN ('CONFIRMED','FULFILLED','COMPLETED')
      AND "totalCents" > "paidCents" - "refundedCents"
    GROUP BY 1`;
  return ['0-30', '31-60', '61-90', '90+'].map((b) => rows.find((r) => r.bucket === b) ?? { bucket: b, cents: 0, orders: 0 });
}

export async function paymentMethods(ctx: OrgContext, range: Range) {
  const rows = await prisma.payment.groupBy({
    by: ['method'],
    where: { organizationId: ctx.organizationId, kind: 'PAYMENT', receivedAt: { gte: range.from, lte: range.to } },
    _sum: { amountCents: true },
    _count: true,
    orderBy: { method: 'asc' },
  });
  return rows.map((r) => ({ method: r.method, cents: r._sum?.amountCents ?? 0, count: r._count }));
}
