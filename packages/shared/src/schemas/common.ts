import { z } from 'zod';

export const idSchema = z.string().uuid();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
});

export const sortDir = z.enum(['asc', 'desc']).default('desc');

export const dateRangeQuery = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((r) => r.from <= r.to, { message: '`from` must be before `to`', path: ['from'] })
  .refine((r) => r.to.getTime() - r.from.getTime() <= 1000 * 60 * 60 * 24 * 731, {
    message: 'Date range cannot exceed two years',
    path: ['to'],
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export { optionalText };

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
