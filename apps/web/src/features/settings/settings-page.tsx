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
import { Field, Input } from '@/components/ui/input';
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
        <PasswordSettings />
      </div>
    </div>
  );
}
