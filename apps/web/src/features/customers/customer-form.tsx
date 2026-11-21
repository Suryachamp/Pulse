import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { customerInputSchema } from '@pulse/shared';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import type { CustomerDetail } from '@/types/api';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';

const formSchema = customerInputSchema.omit({ tags: true }).extend({ tags: z.string().max(400) });
type FormValues = z.input<typeof formSchema>;
const FIELDS = ['name', 'email', 'phone', 'company', 'address', 'notes', 'tags'] as const;

const toTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];

export function CustomerForm({ open, onOpenChange, customer, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; customer?: CustomerDetail; onSaved?: (id: string) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (open) {
      reset({
        name: customer?.name ?? '', email: customer?.email ?? '', phone: customer?.phone ?? '', company: customer?.company ?? '',
        address: customer?.address ?? '', notes: customer?.notes ?? '', tags: customer?.tags.join(', ') ?? '',
      });
    }
  }, [open, customer, reset]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = { ...values, tags: toTags(values.tags) };
      return customer ? api.patch<{ id: string }>(`/customers/${customer.id}`, body) : api.post<{ id: string }>('/customers', body);
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', c.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(customer ? 'Customer saved' : 'Customer added');
      onOpenChange(false);
      onSaved?.(c.id);
    },
    onError: (err) => applyServerErrors(err, setError, FIELDS),
  });

  const onSubmit = handleSubmit((v) => save.mutate(v));
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? 'Edit customer' : 'New customer'}
      description={customer ? undefined : 'Only a name is required. Add contact details so your team can follow up.'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={onSubmit}>{customer ? 'Save customer' : 'Add customer'}</Button></>}
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field id="c-name" label="Name" error={errors.name?.message}><Input id="c-name" autoFocus aria-invalid={!!errors.name} {...register('name')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="c-email" label="Email" error={errors.email?.message}><Input id="c-email" type="email" aria-invalid={!!errors.email} {...register('email')} /></Field>
          <Field id="c-phone" label="Phone" error={errors.phone?.message}><Input id="c-phone" type="tel" {...register('phone')} /></Field>
        </div>
        <Field id="c-company" label="Company" error={errors.company?.message}><Input id="c-company" {...register('company')} /></Field>
        <Field id="c-address" label="Address" error={errors.address?.message}><Textarea id="c-address" rows={2} {...register('address')} /></Field>
        <Field id="c-tags" label="Tags" hint="Comma-separated, e.g. wholesale, net-30" error={errors.tags?.message}><Input id="c-tags" {...register('tags')} /></Field>
        <Field id="c-notes" label="Notes" error={errors.notes?.message}><Textarea id="c-notes" rows={4} {...register('notes')} /></Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
