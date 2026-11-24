import type { OrderStatus } from './enums';

export const INVOICE_STATUSES = ['DUE', 'OVERDUE', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Due date = issue date + payment terms, in whole days (UTC, so DST never shifts it). */
export function invoiceDueDate(issuedAt: Date, paymentTermsDays: number): Date {
  return new Date(issuedAt.getTime() + paymentTermsDays * DAY_MS);
}

/** Cancelled orders void their invoice; otherwise a balance past its due date is overdue. */
export function invoiceStatus(orderStatus: OrderStatus, outstandingCents: number, dueAt: Date, now: Date = new Date()): InvoiceStatus {
  if (orderStatus === 'CANCELLED') return 'VOID';
  if (outstandingCents <= 0) return 'PAID';
  return now.getTime() > dueAt.getTime() ? 'OVERDUE' : 'DUE';
}
