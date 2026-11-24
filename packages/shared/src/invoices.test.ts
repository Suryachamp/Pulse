import { describe, expect, it } from 'vitest';
import { invoiceDueDate, invoiceStatus } from './invoices';

describe('invoice rules', () => {
  it('adds payment terms in whole UTC days to the issue date', () => {
    expect(invoiceDueDate(new Date('2026-01-30T15:00:00Z'), 14).toISOString()).toBe('2026-02-13T15:00:00.000Z');
    expect(invoiceDueDate(new Date('2026-03-01T00:00:00Z'), 0).toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('derives the invoice status from the order, balance and due date', () => {
    const due = new Date('2026-05-10T00:00:00Z');
    const before = new Date('2026-05-09T00:00:00Z');
    const after = new Date('2026-05-11T00:00:00Z');
    expect(invoiceStatus('CANCELLED', 0, due, after)).toBe('VOID');
    expect(invoiceStatus('CONFIRMED', 0, due, after)).toBe('PAID');
    expect(invoiceStatus('FULFILLED', 500, due, before)).toBe('DUE');
    expect(invoiceStatus('COMPLETED', 500, due, after)).toBe('OVERDUE');
    expect(invoiceStatus('CONFIRMED', 500, due, due)).toBe('DUE');
  });
});
