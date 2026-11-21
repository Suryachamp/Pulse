import type { OrderStatus } from '@prisma/client';
import { Prisma, type Tx } from '../../database/prisma';
import { notFound } from '../../utils/errors';

export interface LockedOrder {
  id: string;
  number: number;
  status: OrderStatus;
  customerId: string;
  createdById: string | null;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
}

/**
 * Takes a row lock on the order for the rest of the transaction. Every state change
 * and payment goes through this, so concurrent requests on one order are serialized
 * and each sees the other's committed result.
 */
export async function lockOrder(tx: Tx, organizationId: string, id: string): Promise<LockedOrder> {
  const rows = await tx.$queryRaw<LockedOrder[]>(Prisma.sql`
    SELECT "id", "number", "status", "customerId", "createdById", "totalCents", "paidCents", "refundedCents"
    FROM "Order" WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE`);
  const row = rows[0];
  if (!row) throw notFound('Order');
  return row;
}
