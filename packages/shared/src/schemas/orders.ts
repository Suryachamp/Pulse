import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_KINDS, PAYMENT_METHODS, PAYMENT_STATUSES } from '../enums';
import { optionalText, paginationQuery, sortDir } from './common';

export const orderItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100_000),
});

export const orderInputSchema = z.object({
  customerId: z.string().uuid({ message: 'Select a customer' }),
  items: z
    .array(orderItemInputSchema)
    .min(1, 'Add at least one product')
    .max(200)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, 'Each product can only appear once'),
  discountCents: z.number().int().min(0).default(0),
  taxRateBps: z.number().int().min(0).max(10_000).optional(),
  notes: optionalText(2000),
});
export type OrderInput = z.input<typeof orderInputSchema>;

export const orderTransitionSchema = z.object({
  status: z.enum(['CONFIRMED', 'FULFILLED', 'COMPLETED', 'CANCELLED']),
  reason: z.string().trim().max(500).optional(),
});
export type OrderTransitionInput = z.infer<typeof orderTransitionSchema>;

export const orderListQuery = paginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  customerId: z.string().uuid().optional(),
  /** Only orders whose invoice is past its due date with a balance left. Strict: "false" means false. */
  overdue: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  sort: z.enum(['number', 'createdAt', 'totalCents']).default('createdAt'),
  dir: sortDir,
});
export type OrderListQuery = z.infer<typeof orderListQuery>;

export const paymentInputSchema = z.object({
  kind: z.enum(PAYMENT_KINDS).default('PAYMENT'),
  method: z.enum(PAYMENT_METHODS),
  amountCents: z.number().int().min(1, 'Amount must be positive').max(100_000_000_00),
  reference: optionalText(120),
  note: optionalText(500),
  receivedAt: z.coerce.date().optional(),
  /** Client-generated key so retries and double-clicks never create a second record. */
  idempotencyKey: z.string().trim().min(8).max(100),
});
export type PaymentInput = z.input<typeof paymentInputSchema>;

export const paymentListQuery = paginationQuery.extend({
  kind: z.enum(PAYMENT_KINDS).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type PaymentListQuery = z.infer<typeof paymentListQuery>;
