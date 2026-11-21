import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PAYMENT_METHODS, toCents, type PaymentKind } from '@pulse/shared';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { idempotencyKey, money, sentence } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const formSchema = z.object({
  amount: z.string().trim().refine((v) => toCents(v) > 0, 'Enter an amount greater than zero'),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120),
  note: z.string().trim().max(500),
  receivedAt: z.string().min(1, 'Choose a date'),
});
type FormValues = z.infer<typeof formSchema>;

const today = () => new Date().toISOString().slice(0, 10);

export function PaymentDialog({ orderId, orderNumber, kind, maxCents, open, onOpenChange }: { orderId: string; orderNumber: number; kind: PaymentKind; maxCents: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  // One key per dialog session: a double-click or network retry replays the same request.
  const key = useRef(idempotencyKey());
  const { register, handleSubmit, control, reset, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (open) {
      key.current = idempotencyKey();
      reset({ amount: (maxCents / 100).toFixed(2), method: kind === 'REFUND' ? 'CARD' : 'BANK_TRANSFER', reference: '', note: '', receivedAt: today() });
    }
  }, [open, maxCents, kind, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const cents = toCents(v.amount);
      const day = new Date(`${v.receivedAt}T12:00:00`);
      const receivedAt = v.receivedAt === today() ? new Date() : day;
      return api.post(`/orders/${orderId}/payments`, { kind, method: v.method, amountCents: cents, reference: v.reference, note: v.note, receivedAt: receivedAt.toISOString(), idempotencyKey: key.current });
    },
    onSuccess: () => {
      for (const k of ['order', 'orders', 'payments', 'dashboard', 'customer']) qc.invalidateQueries({ queryKey: [k] });
      toast.success(kind === 'PAYMENT' ? 'Payment recorded' : 'Refund recorded');
      onOpenChange(false);
    },
    onError: (err) => applyServerErrors(err, setError, ['reference', 'note']),
  });
  // Early feedback only; the server enforces the same limit under a row lock.
  const onSubmit = handleSubmit((v) => {
    if (toCents(v.amount) > maxCents) {
      setError('amount', { message: `${kind === 'PAYMENT' ? 'The outstanding balance' : 'The refundable amount'} is ${money(maxCents)}` });
      return;
    }
    save.mutate(v);
  });
  const label = kind === 'PAYMENT' ? 'Record payment' : 'Record refund';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${label} · order #${orderNumber}`}
      description={kind === 'PAYMENT' ? `Outstanding balance: ${money(maxCents)}. This records money you’ve already received; it doesn’t charge a card.` : `Up to ${money(maxCents)} can be refunded. Record this after you’ve returned the money.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant={kind === 'REFUND' ? 'danger' : 'primary'} loading={save.isPending} onClick={onSubmit}>{label}</Button></>}
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="pay-amount" label="Amount (USD)" error={errors.amount?.message}><Input id="pay-amount" inputMode="decimal" autoFocus aria-invalid={!!errors.amount} {...register('amount')} /></Field>
          <Field id="pay-date" label={kind === 'PAYMENT' ? 'Received on' : 'Refunded on'} error={errors.receivedAt?.message}><Input id="pay-date" type="date" max={today()} {...register('receivedAt')} /></Field>
        </div>
        <Field id="pay-method" label="Method">
          <Controller control={control} name="method" render={({ field }) => <Select id="pay-method" value={field.value} onValueChange={field.onChange} options={PAYMENT_METHODS.map((m) => ({ value: m, label: sentence(m) }))} />} />
        </Field>
        <Field id="pay-ref" label="Reference (optional)" hint="Check number, transfer ID or receipt. Used to catch duplicates." error={errors.reference?.message}><Input id="pay-ref" {...register('reference')} /></Field>
        <Field id="pay-note" label="Note (optional)" error={errors.note?.message}><Input id="pay-note" {...register('note')} /></Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
