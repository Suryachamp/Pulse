import type { z } from 'zod';
import type { ProductListQuery, StockAdjustmentInput, productInputSchema, productUpdateSchema } from '@pulse/shared';
import { Prisma, prisma } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { conflict, notFound } from '../../utils/errors';
import { paginate } from '../../utils/http';
import { audit } from '../audit/audit.service';
import { applyStockChanges } from './stock';

type ProductCreate = z.output<typeof productInputSchema>;
type ProductUpdate = z.output<typeof productUpdateSchema>;

const SORT_SQL: Record<ProductListQuery['sort'], Prisma.Sql> = {
  name: Prisma.sql`"name"`,
  sku: Prisma.sql`"sku"`,
  available: Prisma.sql`("onHand" - "reserved")`,
  priceCents: Prisma.sql`"priceCents"`,
  createdAt: Prisma.sql`"createdAt"`,
};

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  costCents: number | null;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function stockWhere(ctx: OrgContext, q: Pick<ProductListQuery, 'stock' | 'status' | 'q'>) {
  const c: Prisma.Sql[] = [Prisma.sql`"organizationId" = ${ctx.organizationId}::uuid`];
  if (q.status === 'active') c.push(Prisma.sql`"archivedAt" IS NULL`);
  if (q.status === 'archived') c.push(Prisma.sql`"archivedAt" IS NOT NULL`);
  if (q.stock === 'low') c.push(Prisma.sql`("onHand" - "reserved") <= "lowStockThreshold"`);
  if (q.stock === 'out') c.push(Prisma.sql`("onHand" - "reserved") <= 0`);
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
    c.push(Prisma.sql`("name" ILIKE ${like} OR "sku" ILIKE ${like})`);
  }
  return Prisma.join(c, ' AND ');
}

export async function listProducts(ctx: OrgContext, q: ProductListQuery) {
  const where = stockWhere(ctx, q);
  const dir = q.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<ProductRow[]>`
      SELECT "id","sku","name","description","priceCents","costCents","onHand","reserved",("onHand"-"reserved")::int AS "available",
             "lowStockThreshold","archivedAt","createdAt","updatedAt"
      FROM "Product" WHERE ${where}
      ORDER BY ${SORT_SQL[q.sort]} ${dir}, "id"
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "Product" WHERE ${where}`,
  ]);
  return paginate(rows, Number(count[0]?.count ?? 0), q.page, q.pageSize);
}

export async function lowStockProducts(ctx: OrgContext, limit = 8) {
  return prisma.$queryRaw<ProductRow[]>`
    SELECT "id","sku","name","priceCents","onHand","reserved",("onHand"-"reserved")::int AS "available","lowStockThreshold"
    FROM "Product"
    WHERE "organizationId" = ${ctx.organizationId}::uuid AND "archivedAt" IS NULL AND ("onHand" - "reserved") <= "lowStockThreshold"
    ORDER BY ("onHand" - "reserved") ASC, "name" LIMIT ${limit}`;
}

const withAvailable = <T extends { onHand: number; reserved: number }>(p: T) => ({ ...p, available: p.onHand - p.reserved });

export async function getProduct(ctx: OrgContext, id: string) {
  const product = await prisma.product.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!product) throw notFound('Product');
  const [movements, sales] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where: { organizationId: ctx.organizationId, productId: id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { actor: { select: { id: true, name: true } }, order: { select: { id: true, number: true } } },
    }),
    prisma.orderItem.aggregate({
      where: { organizationId: ctx.organizationId, productId: id, order: { status: { in: ['FULFILLED', 'COMPLETED'] } } },
      _sum: { quantity: true, lineTotalCents: true },
    }),
  ]);
  return { ...withAvailable(product), movements, unitsSold: sales._sum.quantity ?? 0, revenueCents: sales._sum.lineTotalCents ?? 0 };
}

export async function createProduct(ctx: OrgContext, input: ProductCreate) {
  const { initialStock, lowStockThreshold, ...data } = input;
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { defaultLowStockThreshold: true } });
    const p = await tx.product.create({
      data: { ...data, organizationId: ctx.organizationId, lowStockThreshold: lowStockThreshold ?? org.defaultLowStockThreshold },
    });
    if (initialStock > 0) {
      await applyStockChanges(tx, ctx, [{ productId: p.id, onHandDelta: initialStock, reservedDelta: 0, type: 'INITIAL', reason: 'Opening stock' }]);
    }
    await audit(tx, ctx, { action: 'product.created', entityType: 'Product', entityId: p.id, summary: `Added product ${p.name} (${p.sku})`, metadata: { initialStock } });
    return withAvailable(await tx.product.findUniqueOrThrow({ where: { id: p.id } }));
  });
}

export async function updateProduct(ctx: OrgContext, id: string, input: ProductUpdate) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) throw notFound('Product');
    const p = await tx.product.update({ where: { id }, data: input });
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(input) as (keyof ProductUpdate)[]) {
      if (existing[key] !== p[key]) changes[key] = { from: existing[key], to: p[key] };
    }
    await audit(tx, ctx, { action: 'product.updated', entityType: 'Product', entityId: id, summary: `Updated product ${p.name}`, metadata: { changes: changes as Prisma.InputJsonObject } });
    return withAvailable(p);
  });
}

export async function adjustStock(ctx: OrgContext, id: string, input: StockAdjustmentInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { name: true } });
    if (!existing) throw notFound('Product');
    const [row] = await applyStockChanges(tx, ctx, [{ productId: id, onHandDelta: input.quantity, reservedDelta: 0, type: input.type, reason: input.reason }]);
    await audit(tx, ctx, {
      action: input.type === 'RESTOCK' ? 'inventory.restocked' : 'inventory.adjusted',
      entityType: 'Product',
      entityId: id,
      summary: `${input.type === 'RESTOCK' ? 'Restocked' : 'Adjusted'} ${existing.name} by ${input.quantity > 0 ? '+' : ''}${input.quantity}`,
      metadata: { quantity: input.quantity, reason: input.reason, onHandAfter: row?.onHand ?? null },
    });
    return withAvailable(await tx.product.findUniqueOrThrow({ where: { id } }));
  });
}

export async function setArchived(ctx: OrgContext, id: string, archived: boolean) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!existing) throw notFound('Product');
    const p = await tx.product.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, ctx, { action: archived ? 'product.archived' : 'product.restored', entityType: 'Product', entityId: id, summary: `${archived ? 'Archived' : 'Restored'} ${p.name}` });
    return withAvailable(p);
  });
}

export async function deleteProduct(ctx: OrgContext, id: string) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.product.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { _count: { select: { orderItems: true } } } });
    if (!existing) throw notFound('Product');
    if (existing._count.orderItems > 0) throw conflict('This product appears on orders. Archive it instead to keep order history intact.');
    await tx.product.delete({ where: { id } });
    await audit(tx, ctx, { action: 'product.deleted', entityType: 'Product', entityId: id, summary: `Deleted product ${existing.name} (${existing.sku})` });
  });
}
