import type { MovementType } from '@prisma/client';
import { Prisma, type Tx } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { notFound, unprocessable } from '../../utils/errors';
import { notifyRoles } from '../notifications/notifications.service';

export interface StockChange {
  productId: string;
  onHandDelta: number;
  reservedDelta: number;
  type: MovementType;
  orderId?: string;
  reason?: string;
}

interface StockRow {
  id: string;
  name: string;
  sku: string;
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
}

/**
 * The single place stock is changed. The guarded UPDATE is atomic: Postgres takes a
 * row lock, re-checks the WHERE clause against the latest committed row, and only
 * applies the change if the resulting stock is valid. Two orders racing for the last
 * unit therefore cannot both succeed, without any application-level locking.
 *
 * Callers must apply multi-product changes in a consistent order (sorted by id) to
 * avoid deadlocks; applyStockChanges does this.
 */
async function applyStockChange(tx: Tx, ctx: Pick<OrgContext, 'organizationId' | 'userId'>, change: StockChange) {
  const { productId, onHandDelta: dOn, reservedDelta: dRes } = change;
  const rows = await tx.$queryRaw<StockRow[]>(Prisma.sql`
    UPDATE "Product"
    SET "onHand" = "onHand" + ${dOn}, "reserved" = "reserved" + ${dRes}, "updatedAt" = now()
    WHERE "id" = ${productId}::uuid AND "organizationId" = ${ctx.organizationId}::uuid
      AND "onHand" + ${dOn} >= 0
      AND "reserved" + ${dRes} >= 0
      AND "onHand" + ${dOn} >= "reserved" + ${dRes}
    RETURNING "id", "name", "sku", "onHand", "reserved", "lowStockThreshold"`);
  const row = rows[0];
  if (!row) {
    const current = await tx.product.findFirst({ where: { id: productId, organizationId: ctx.organizationId }, select: { name: true, sku: true, onHand: true, reserved: true } });
    if (!current) throw notFound('Product');
    throw unprocessable('INSUFFICIENT_STOCK', `Not enough stock for ${current.name}: ${current.onHand - current.reserved} available`, {
      productId,
      sku: current.sku,
      available: current.onHand - current.reserved,
      onHand: current.onHand,
      reserved: current.reserved,
    });
  }

  await tx.inventoryMovement.create({
    data: {
      organizationId: ctx.organizationId,
      productId,
      orderId: change.orderId ?? null,
      actorId: ctx.userId,
      type: change.type,
      onHandDelta: dOn,
      reservedDelta: dRes,
      onHandAfter: row.onHand,
      reservedAfter: row.reserved,
      reason: change.reason ?? null,
    },
  });

  const availableAfter = row.onHand - row.reserved;
  const availableBefore = availableAfter - (dOn - dRes);
  if (availableBefore > row.lowStockThreshold && availableAfter <= row.lowStockThreshold) {
    await notifyRoles(tx, ctx.organizationId, ['OWNER', 'ADMIN', 'MANAGER'], {
      type: 'LOW_STOCK',
      title: availableAfter === 0 ? `${row.name} is out of stock` : `${row.name} is running low`,
      body: `${availableAfter} available (threshold ${row.lowStockThreshold}). SKU ${row.sku}.`,
      link: `/app/inventory/${row.id}`,
    });
  }
  return row;
}

export async function applyStockChanges(tx: Tx, ctx: Pick<OrgContext, 'organizationId' | 'userId'>, changes: StockChange[]) {
  const sorted = [...changes].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  const results: StockRow[] = [];
  for (const change of sorted) results.push(await applyStockChange(tx, ctx, change));
  return results;
}
