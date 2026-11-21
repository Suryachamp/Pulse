import { z } from 'zod';
import { optionalText, paginationQuery, sortDir } from './common';

const cents = z.number().int().min(0).max(100_000_000_00);

export const productInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required')
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only'),
  name: z.string().trim().min(1, 'Name is required').max(150),
  description: optionalText(2000),
  priceCents: cents,
  costCents: cents.nullable().optional(),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional(),
  initialStock: z.number().int().min(0).max(10_000_000).default(0),
});
export type ProductInput = z.input<typeof productInputSchema>;

export const productUpdateSchema = productInputSchema.omit({ initialStock: true }).partial();

export const productListQuery = paginationQuery.extend({
  stock: z.enum(['all', 'low', 'out']).default('all'),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  sort: z.enum(['name', 'sku', 'available', 'priceCents', 'createdAt']).default('name'),
  dir: sortDir,
});
export type ProductListQuery = z.infer<typeof productListQuery>;

export const stockAdjustmentSchema = z.object({
  type: z.enum(['RESTOCK', 'ADJUSTMENT']),
  /** Signed change to on-hand quantity. Restocks must be positive. */
  quantity: z.number().int().min(-10_000_000).max(10_000_000).refine((q) => q !== 0, 'Quantity cannot be zero'),
  reason: z.string().trim().min(3, 'Give a short reason').max(500),
}).refine((v) => v.type !== 'RESTOCK' || v.quantity > 0, {
  message: 'Restock quantity must be positive',
  path: ['quantity'],
});
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
