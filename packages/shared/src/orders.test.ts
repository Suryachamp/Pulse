import { describe, expect, it } from 'vitest';
import { calculateOrderTotals, canTransition, derivePaymentStatus, outstandingCents } from './orders';
import { toCents } from './money';
import { can, canManageRole } from './permissions';

describe('order rules', () => {
  it('only allows defined transitions', () => {
    expect(canTransition('DRAFT', 'CONFIRMED')).toBe(true);
    expect(canTransition('DRAFT', 'FULFILLED')).toBe(false);
    expect(canTransition('FULFILLED', 'CANCELLED')).toBe(false);
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('calculates totals in integer cents with tax after discount', () => {
    const t = calculateOrderTotals({
      items: [{ unitPriceCents: 1999, quantity: 3 }, { unitPriceCents: 500, quantity: 1 }],
      discountCents: 497,
      taxRateBps: 825,
    });
    expect(t).toEqual({ subtotalCents: 6497, discountCents: 497, taxCents: 495, totalCents: 6495 });
  });

  it('caps discount at subtotal', () => {
    expect(calculateOrderTotals({ items: [{ unitPriceCents: 100, quantity: 1 }], discountCents: 999, taxRateBps: 0 }).totalCents).toBe(0);
  });

  it('derives payment status from transactions', () => {
    expect(derivePaymentStatus(1000, 0, 0)).toBe('UNPAID');
    expect(derivePaymentStatus(1000, 400, 0)).toBe('PARTIALLY_PAID');
    expect(derivePaymentStatus(1000, 1000, 0)).toBe('PAID');
    expect(derivePaymentStatus(1000, 1000, 300)).toBe('PARTIALLY_REFUNDED');
    expect(derivePaymentStatus(1000, 1000, 1000)).toBe('REFUNDED');
  });

  it('only counts outstanding balances on live orders', () => {
    expect(outstandingCents('DRAFT', 1000, 0, 0)).toBe(0);
    expect(outstandingCents('CANCELLED', 1000, 0, 0)).toBe(0);
    expect(outstandingCents('FULFILLED', 1000, 250, 0)).toBe(750);
  });
});

describe('money', () => {
  it('parses decimals without float drift', () => {
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('12')).toBe(1200);
    expect(Number.isNaN(toCents('1.234'))).toBe(true);
    expect(Number.isNaN(toCents('abc'))).toBe(true);
  });
});

describe('permissions', () => {
  it('enforces the matrix', () => {
    expect(can('STAFF', 'payments:refund')).toBe(false);
    expect(can('ADMIN', 'payments:refund')).toBe(true);
    expect(can('STAFF', 'orders:cancel')).toBe(false);
    expect(canManageRole('ADMIN', 'OWNER')).toBe(false);
    expect(canManageRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageRole('ADMIN', 'STAFF')).toBe(true);
    expect(canManageRole('MANAGER', 'STAFF')).toBe(false);
  });
});
