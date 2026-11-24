import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { passwordSchema } from '@pulse/shared';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { ME_KEY, useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/feedback';

const orgSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100),
  defaultLowStockThreshold: z.coerce.number().int('Whole numbers only').min(0).max(100_000),
  taxRate: z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter a percentage like 8.25').refine((v) => Number(v) <= 100, 'Max 100%'),
});
type OrgValues = z.input<typeof orgSchema>;

const pwSchema = z.object({ currentPassword: z.string().min(1, 'Required'), newPassword: passwordSchema, confirm: z.string() }).refine((v) => v.newPassword === v.confirm, { message: 'Passwords don’t match', path: ['confirm'] });
type PwValues = z.infer<typeof pwSchema>;

function OrgSettings() {
  const { me } = useSession();
  const qc = useQueryClient();
  const org = me?.organization;
  const { register, handleSubmit, reset, setError, formState: { errors, isDirty } } = useForm<OrgValues>({ resolver: zodResolver(orgSchema) });
  useEffect(() => { if (org) reset({ name: org.name, defaultLowStockThreshold: org.defaultLowStockThreshold, taxRate: (org.defaultTaxRateBps / 100).toString() }); }, [org, reset]);
  const save = useMutation({
    mutationFn: (raw: OrgValues) => {
      const v = orgSchema.parse(raw);
      return api.patch('/organization', { name: v.name, defaultLowStockThreshold: v.defaultLowStockThreshold, defaultTaxRateBps: Math.round(Number(v.taxRate) * 100) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ME_KEY }); toast.success('Settings saved'); },
    onError: (err) => applyServerErrors(err, setError, ['name', 'defaultLowStockThreshold']),
  });
  return (
    <section className="panel p-5" aria-label="Organization">
      <h2 className="font-semibold">Organization</h2>
      <p className="mb-5 mt-1 text-sm text-mist">Defaults apply to new products and orders. Existing records keep their values.</p>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="grid max-w-lg gap-4" noValidate>
        <Field id="s-name" label="Business name" error={errors.name?.message}><Input id="s-name" {...register('name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="s-threshold" label="Default low-stock threshold" error={errors.defaultLowStockThreshold?.message}><Input id="s-threshold" type="number" min={0} {...register('defaultLowStockThreshold')} /></Field>
          <Field id="s-tax" label="Default tax rate (%)" error={errors.taxRate?.message}><Input id="s-tax" inputMode="decimal" {...register('taxRate')} /></Field>
        </div>
        <div><Button type="submit" variant="primary" disabled={!isDirty} loading={save.isPending}>Save settings</Button></div>
      </form>
    </section>
  );
}

const invoiceSchema = z.object({
  invoiceAddress: z.string().trim().max(500),
  invoiceEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email')]),
  invoicePhone: z.string().trim().max(40),
  invoiceTaxId: z.string().trim().max(60),
  invoiceFooter: z.string().trim().max(1000),
  paymentTermsDays: z.coerce.number({ invalid_type_error: 'Enter a number of days' }).int('Whole days only').min(0, 'Can’t be negative').max(365, 'At most 365 days'),
});
type InvoiceValues = z.input<typeof invoiceSchema>;
const INVOICE_FIELDS = ['invoiceAddress', 'invoiceEmail', 'invoicePhone', 'invoiceTaxId', 'invoiceFooter', 'paymentTermsDays'] as const;

function InvoiceSettings() {
  const { me } = useSession();
  const qc = useQueryClient();
  const org = me?.organization;
  const { register, handleSubmit, reset, setError, formState: { errors, isDirty } } = useForm<InvoiceValues>({ resolver: zodResolver(invoiceSchema) });
  useEffect(() => {
    if (org) reset({
      invoiceAddress: org.invoiceAddress ?? '', invoiceEmail: org.invoiceEmail ?? '', invoicePhone: org.invoicePhone ?? '',
      invoiceTaxId: org.invoiceTaxId ?? '', invoiceFooter: org.invoiceFooter ?? '', paymentTermsDays: org.paymentTermsDays,
    });
  }, [org, reset]);
  const save = useMutation({
    // Empty strings are sent as-is; the API stores them as "not set".
    mutationFn: (raw: InvoiceValues) => api.patch('/organization', invoiceSchema.parse(raw)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ME_KEY }); qc.invalidateQueries({ queryKey: ['invoice'] }); toast.success('Invoice details saved'); },
    onError: (err) => applyServerErrors(err, setError, [...INVOICE_FIELDS]),
  });
  return (
    <section className="panel p-5" aria-label="Invoices">
      <h2 className="font-semibold">Invoices</h2>
      <p className="mb-5 mt-1 text-sm text-mist">Printed on every invoice. Changes apply to all invoices, including ones already issued.</p>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="grid max-w-lg gap-4" noValidate>
        <Field id="inv-address" label="Business address" error={errors.invoiceAddress?.message}><Textarea id="inv-address" rows={3} {...register('invoiceAddress')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="inv-email" label="Billing email" error={errors.invoiceEmail?.message}><Input id="inv-email" type="email" {...register('invoiceEmail')} /></Field>
          <Field id="inv-phone" label="Phone" error={errors.invoicePhone?.message}><Input id="inv-phone" type="tel" {...register('invoicePhone')} /></Field>
          <Field id="inv-taxid" label="Tax ID" error={errors.invoiceTaxId?.message}><Input id="inv-taxid" {...register('invoiceTaxId')} /></Field>
          <Field id="inv-terms" label="Payment terms (days)" hint="0 means due on receipt." error={errors.paymentTermsDays?.message}><Input id="inv-terms" type="number" min={0} max={365} {...register('paymentTermsDays')} /></Field>
        </div>
        <Field id="inv-footer" label="Footer note" hint="Payment instructions, bank details or a thank-you." error={errors.invoiceFooter?.message}><Textarea id="inv-footer" rows={3} {...register('invoiceFooter')} /></Field>
        <div><Button type="submit" variant="primary" disabled={!isDirty} loading={save.isPending}>Save invoice details</Button></div>
      </form>
    </section>
  );
}

function PasswordSettings() {
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<PwValues>({ resolver: zodResolver(pwSchema) });
  const save = useMutation({
    mutationFn: (v: PwValues) => api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => { reset({ currentPassword: '', newPassword: '', confirm: '' }); toast.success('Password changed', { description: 'Other devices have been signed out.' }); },
    onError: (err) => applyServerErrors(err, setError, ['currentPassword', 'newPassword']),
  });
  return (
    <section className="panel p-5" aria-label="Password">
      <h2 className="font-semibold">Password</h2>
      <p className="mb-5 mt-1 text-sm text-mist">Changing your password signs you out everywhere else.</p>
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="grid max-w-lg gap-4" noValidate>
        <Field id="pw-current" label="Current password" error={errors.currentPassword?.message}><Input id="pw-current" type="password" autoComplete="current-password" {...register('currentPassword')} /></Field>
        <Field id="pw-new" label="New password" hint="At least 10 characters with a letter and a number." error={errors.newPassword?.message}><Input id="pw-new" type="password" autoComplete="new-password" {...register('newPassword')} /></Field>
        <Field id="pw-confirm" label="Confirm new password" error={errors.confirm?.message}><Input id="pw-confirm" type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        <div><Button type="submit" loading={save.isPending}>Change password</Button></div>
      </form>
    </section>
  );
}

export default function SettingsPage() {
  const { me, can } = useSession();
  return (
    <div>
      <PageHeader title="Settings" description={`Signed in as ${me?.user.email}`} />
      <div className="grid gap-6">
        {can('org:manage') && <OrgSettings />}
        {can('org:manage') && <InvoiceSettings />}
        <PasswordSettings />
      </div>
    </div>
  );
}
