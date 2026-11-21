import { z } from 'zod';
import { optionalText, paginationQuery, sortDir } from './common';

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .transform((v) => (v === '' ? null : v))
    .pipe(z.string().email('Enter a valid email').nullable())
    .nullable()
    .optional(),
  phone: optionalText(40),
  company: optionalText(150),
  address: optionalText(500),
  notes: optionalText(5000),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});
export type CustomerInput = z.input<typeof customerInputSchema>;

export const customerUpdateSchema = customerInputSchema.partial();

export const customerListQuery = paginationQuery.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  tag: z.string().trim().max(30).optional(),
  sort: z.enum(['name', 'createdAt', 'totalSpent', 'lastOrderAt']).default('createdAt'),
  dir: sortDir,
});
export type CustomerListQuery = z.infer<typeof customerListQuery>;
