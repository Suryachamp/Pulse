import { customerUpdateSchema, type CustomerListQuery, type customerInputSchema } from '@pulse/shared';
import type { z } from 'zod';
import { Prisma, prisma } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { conflict, notFound } from '../../utils/errors';
import { paginate } from '../../utils/http';
import { audit } from '../audit/audit.service';

type CustomerCreate = z.output<typeof customerInputSchema>;
type CustomerUpdate = z.output<typeof customerUpdateSchema>;

const SORT_SQL: Record<CustomerListQuery['sort'], Prisma.Sql> = {
  name: Prisma.sql`c."name"`,
  createdAt: Prisma.sql`c."createdAt"`,
  totalSpent: Prisma.sql`"totalSpentCents"`,
  lastOrderAt: Prisma.sql`"lastOrderAt"`,
};

interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
  archivedAt: Date | null;
  createdAt: Date;
  orderCount: number;
  totalSpentCents: number;
  outstandingCents: number;
  lastOrderAt: Date | null;
}

/** Customer stats count booked orders only: drafts and cancellations are not sales. */
export async function listCustomers(ctx: OrgContext, q: CustomerListQuery) {
  const conditions: Prisma.Sql[] = [Prisma.sql`c."organizationId" = ${ctx.organizationId}::uuid`];
  if (q.status === 'active') conditions.push(Prisma.sql`c."archivedAt" IS NULL`);
  if (q.status === 'archived') conditions.push(Prisma.sql`c."archivedAt" IS NOT NULL`);
  if (q.tag) conditions.push(Prisma.sql`${q.tag} = ANY(c."tags")`);
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
    conditions.push(Prisma.sql`(c."name" ILIKE ${like} OR c."email" ILIKE ${like} OR c."company" ILIKE ${like} OR c."phone" ILIKE ${like})`);
  }
  const where = Prisma.join(conditions, ' AND ');
  const dir = q.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<CustomerRow[]>`
      SELECT c."id", c."name", c."email", c."phone", c."company", c."tags", c."archivedAt", c."createdAt",
             COALESCE(s."orderCount", 0)::int AS "orderCount",
             COALESCE(s."totalSpentCents", 0)::int AS "totalSpentCents",
             COALESCE(s."outstandingCents", 0)::int AS "outstandingCents",
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
      WHERE ${where}
      ORDER BY ${SORT_SQL[q.sort]} ${dir} NULLS LAST, c."id"
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "Customer" c WHERE ${where}`,
  ]);
  return paginate(rows, Number(countRows[0]?.count ?? 0), q.page, q.pageSize);
}

export async function listCustomerTags(ctx: OrgContext) {
  const rows = await prisma.$queryRaw<{ tag: string }[]>`
    SELECT DISTINCT unnest("tags") AS tag FROM "Customer" WHERE "organizationId" = ${ctx.organizationId}::uuid ORDER BY tag LIMIT 200`;
  return rows.map((r) => r.tag);
}

export async function getCustomer(ctx: OrgContext, id: string) {
  const customer = await prisma.customer.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!customer) throw notFound('Customer');
  const [stats, orders, timeline] = await Promise.all([
    prisma.order.aggregate({
      where: { organizationId: ctx.organizationId, customerId: id, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      _sum: { totalCents: true, paidCents: true, refundedCents: true },
      _count: true,
      _max: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { organizationId: ctx.organizationId, customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, number: true, status: true, totalCents: true, paidCents: true, refundedCents: true, createdAt: true, _count: { select: { items: true } } },
    }),
    customerTimeline(ctx, id),
  ]);
  const total = stats._sum.totalCents ?? 0;
  const net = (stats._sum.paidCents ?? 0) - (stats._sum.refundedCents ?? 0);
  return {
    ...customer,
    stats: {
      orderCount: stats._count,
      totalSpentCents: total,
      collectedCents: net,
      outstandingCents: Math.max(0, total - net),
      averageOrderCents: stats._count ? Math.round(total / stats._count) : 0,
      lastOrderAt: stats._max.createdAt,
    },
    orders,
    timeline,
  };
}

/** The activity timeline: audit entries about this customer and about their orders. */
async function customerTimeline(ctx: OrgContext, customerId: string) {
  const orderIds = await prisma.order.findMany({ where: { organizationId: ctx.organizationId, customerId }, select: { id: true } });
  return prisma.auditLog.findMany({
    where: {
      organizationId: ctx.organizationId,
      OR: [
        { entityType: 'Customer', entityId: customerId },
        { entityType: 'Order', entityId: { in: orderIds.map((o) => o.id) } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, summary: true, createdAt: true, entityType: true, entityId: true, actor: { select: { id: true, name: true } } },
  });
}

export async function createCustomer(ctx: OrgContext, input: CustomerCreate) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.customer.create({ data: { ...input, organizationId: ctx.organizationId } });
    await audit(tx, ctx, { action: 'customer.created', entityType: 'Customer', entityId: c.id, summary: `Added customer ${c.name}` });
    return c;
  });
}

export async function updateCustomer(ctx: OrgContext, id: string, input: CustomerUpdate) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) throw notFound('Customer');
    const c = await tx.customer.update({ where: { id }, data: input });
    await audit(tx, ctx, { action: 'customer.updated', entityType: 'Customer', entityId: id, summary: `Updated customer ${c.name}`, metadata: { fields: Object.keys(input) } });
    return c;
  });
}

export async function setArchived(ctx: OrgContext, id: string, archived: boolean) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) throw notFound('Customer');
    const c = await tx.customer.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, ctx, { action: archived ? 'customer.archived' : 'customer.restored', entityType: 'Customer', entityId: id, summary: `${archived ? 'Archived' : 'Restored'} customer ${c.name}` });
    return c;
  });
}

/** Customers with order history are archived, never deleted, so the history stays intact. */
export async function deleteCustomer(ctx: OrgContext, id: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { _count: { select: { orders: true } } } });
    if (!existing) throw notFound('Customer');
    if (existing._count.orders > 0) throw conflict('This customer has orders. Archive them instead to keep the history.');
    await tx.task.updateMany({ where: { organizationId: ctx.organizationId, customerId: id }, data: { customerId: null } });
    await tx.customer.delete({ where: { id } });
    await audit(tx, ctx, { action: 'customer.deleted', entityType: 'Customer', entityId: id, summary: `Deleted customer ${existing.name}` });
  });
}
