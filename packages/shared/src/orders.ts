import type { OrderStatus, PaymentStatus } from './enums';

/** Allowed lifecycle transitions. Anything not listed is rejected by the API. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['FULFILLED', 'CANCELLED'],
  FULFILLED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export interface OrderTotalsInput {
  items: { unitPriceCents: number; quantity: number }[];
  discountCents: number;
  taxRateBps: number;
}

export interface OrderTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
}

/** Integer-cent arithmetic; tax is applied after discount and rounded half-up. */
export function calculateOrderTotals({ items, discountCents, taxRateBps }: OrderTotalsInput): OrderTotals {
  const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const discount = Math.min(discountCents, subtotalCents);
  const taxable = subtotalCents - discount;
  const taxCents = Math.round((taxable * taxRateBps) / 10_000);
  return { subtotalCents, discountCents: discount, taxCents, totalCents: taxable + taxCents };
}

export function derivePaymentStatus(totalCents: number, paidCents: number, refundedCents: number): PaymentStatus {
  const net = paidCents - refundedCents;
  if (refundedCents > 0) return net === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  if (net <= 0) return 'UNPAID';
  if (net < totalCents) return 'PARTIALLY_PAID';
  return 'PAID';
}

/** Outstanding receivable. Drafts and cancelled orders are not owed. */
export function outstandingCents(status: OrderStatus, totalCents: number, paidCents: number, refundedCents: number): number {
  if (status === 'DRAFT' || status === 'CANCELLED') return 0;
  return Math.max(0, totalCents - (paidCents - refundedCents));
}
