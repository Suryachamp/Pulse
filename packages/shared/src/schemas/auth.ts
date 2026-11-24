import { z } from 'zod';
import { ROLES } from '../enums';
import { optionalText } from './common';

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(2).max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const switchOrgSchema = z.object({ organizationId: z.string().uuid() });

export const addMemberSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
  /** Only used when the user does not have an account yet. */
  initialPassword: passwordSchema.optional(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z.object({ role: z.enum(ROLES) });

export const updateOrgSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  defaultLowStockThreshold: z.number().int().min(0).max(100_000).optional(),
  defaultTaxRateBps: z.number().int().min(0).max(10_000).optional(),
  /** Business details printed on invoices. Empty strings clear a field. */
  invoiceAddress: optionalText(500),
  invoiceEmail: z.union([emailSchema, z.literal('').transform(() => null)]).nullable().optional(),
  invoicePhone: optionalText(40),
  invoiceTaxId: optionalText(60),
  invoiceFooter: optionalText(1000),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
});
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
