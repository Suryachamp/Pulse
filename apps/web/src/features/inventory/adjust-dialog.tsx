import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import type { Product } from '@/types/api';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Tabs, TabsList } from '@/components/ui/tabs';

const formSchema = z.object({
  type: z.enum(['RESTOCK', 'ADJUSTMENT']),
  quantity: z.string().trim().regex(/^-?\d+$/, 'Enter a whole number').transform(Number).refine((q) => q !== 0, 'Quantity cannot be zero'),
  reason: z.string().trim().min(3, 'Give a short reason').max(500),
}).refine((v) => v.type !== 'RESTOCK' || v.quantity > 0, { message: 'Restocks add stock, so use a positive number', path: ['quantity'] });
type FormValues = z.input<typeof formSchema>;

export function AdjustStockDialog({ product, open, onOpenChange }: { product: Product; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, control, reset, watch, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { type: 'RESTOCK', quantity: '', reason: '' } });
  useEffect(() => { if (open) reset({ type: 'RESTOCK', quantity: '', reason: '' }); }, [open, reset]);

  const type = watch('type');
  const qty = Number(watch('quantity')) || 0;
  const after = product.onHand + qty;

  const save = useMutation({
    mutationFn: (v: FormValues) => api.post<Product>(`/products/${product.id}/adjustments`, formSchema.parse(v)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product', product.id] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(type === 'RESTOCK' ? 'Stock received' : 'Stock adjusted');
      onOpenChange(false);
    },
    onError: (err) => applyServerErrors(err, setError, ['quantity', 'reason']),
  });
  const onSubmit = handleSubmit((v) => save.mutate(v));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Update stock: ${product.name}`}
      description="Every change is recorded in the movement history with your name and reason."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={onSubmit}>{type === 'RESTOCK' ? 'Receive stock' : 'Apply adjustment'}</Button></>}
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Controller control={control} name="type" render={({ field }) => (
          <Tabs value={field.value} onValueChange={field.onChange}>
            <TabsList items={[{ value: 'RESTOCK', label: 'Receive stock' }, { value: 'ADJUSTMENT', label: 'Correct count' }]} />
          </Tabs>
        )} />
        <Field id="adj-qty" label={type === 'RESTOCK' ? 'Units received' : 'Change in units (use − to remove)'} error={errors.quantity?.message}>
          <Input id="adj-qty" type="number" autoFocus aria-invalid={!!errors.quantity} {...register('quantity')} />
        </Field>
        <Field id="adj-reason" label="Reason" error={errors.reason?.message}>
          <Input id="adj-reason" placeholder={type === 'RESTOCK' ? 'Supplier delivery, PO #1042' : 'Damaged in storage'} aria-invalid={!!errors.reason} {...register('reason')} />
        </Field>
        <div className="grid grid-cols-3 gap-3 rounded-lg border border-line/60 bg-canvas/40 p-3 text-center text-sm">
          <div><p className="text-xs text-faint">On hand</p><p className="tnum font-semibold">{product.onHand} → <span className={after < product.reserved ? 'text-rose' : 'text-brass'}>{after}</span></p></div>
          <div><p className="text-xs text-faint">Reserved</p><p className="tnum font-semibold">{product.reserved}</p></div>
          <div><p className="text-xs text-faint">Available after</p><p className={`tnum font-semibold ${after - product.reserved < 0 ? 'text-rose' : ''}`}>{after - product.reserved}</p></div>
        </div>
        {after < product.reserved && <p className="text-xs text-rose">On-hand stock can’t go below the {product.reserved} units reserved by confirmed orders.</p>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
