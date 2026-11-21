import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toCents } from '@pulse/shared';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import type { Product } from '@/types/api';
import { useSession } from '@/lib/session';
import { Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';

const moneyField = z.string().trim().refine((v) => v === '' || !Number.isNaN(toCents(v)), 'Enter an amount like 19.99');
const formSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(64).regex(/^[A-Za-z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only'),
  name: z.string().trim().min(1, 'Name is required').max(150),
  description: z.string().max(2000),
  price: moneyField.refine((v) => v !== '', 'Price is required'),
  cost: moneyField,
  lowStockThreshold: z.coerce.number().int('Whole numbers only').min(0),
  initialStock: z.coerce.number().int('Whole numbers only').min(0),
});
type FormValues = z.input<typeof formSchema>;
const FIELDS = ['sku', 'name', 'description', 'lowStockThreshold', 'initialStock'] as const;

const fromCents = (c: number | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2));

export function ProductForm({ open, onOpenChange, product, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; product?: Product; onSaved?: (id: string) => void }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (open) {
      reset({
        sku: product?.sku ?? '', name: product?.name ?? '', description: product?.description ?? '',
        price: fromCents(product?.priceCents), cost: fromCents(product?.costCents),
        lowStockThreshold: product?.lowStockThreshold ?? me?.organization?.defaultLowStockThreshold ?? 5, initialStock: 0,
      });
    }
  }, [open, product, reset, me]);

  const save = useMutation({
    mutationFn: (raw: FormValues) => {
      const v = formSchema.parse(raw);
      const body = {
        sku: v.sku, name: v.name, description: v.description, priceCents: toCents(v.price),
        costCents: v.cost === '' ? null : toCents(v.cost), lowStockThreshold: v.lowStockThreshold,
      };
      return product ? api.patch<Product>(`/products/${product.id}`, body) : api.post<Product>('/products', { ...body, initialStock: v.initialStock });
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product', p.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(product ? 'Product saved' : 'Product added');
      onOpenChange(false);
      onSaved?.(p.id);
    },
    onError: (err) => applyServerErrors(err, setError, FIELDS),
  });
  const onSubmit = handleSubmit((v) => save.mutate(v));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={product ? 'Edit product' : 'New product'}
      description={product ? 'Price changes apply to new orders only. Existing orders keep the price they were sold at.' : 'Opening stock is recorded as the first movement in its history.'}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={onSubmit}>{product ? 'Save product' : 'Add product'}</Button></>}
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field id="p-name" label="Name" error={errors.name?.message}><Input id="p-name" autoFocus aria-invalid={!!errors.name} {...register('name')} /></Field>
        <Field id="p-sku" label="SKU" error={errors.sku?.message}><Input id="p-sku" className="uppercase" aria-invalid={!!errors.sku} {...register('sku')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="p-price" label="Price (USD)" error={errors.price?.message}><Input id="p-price" inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.price} {...register('price')} /></Field>
          <Field id="p-cost" label="Unit cost (optional)" hint="Used for stock valuation." error={errors.cost?.message}><Input id="p-cost" inputMode="decimal" placeholder="0.00" {...register('cost')} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="p-threshold" label="Low-stock threshold" hint="Alert when available stock reaches this." error={errors.lowStockThreshold?.message}><Input id="p-threshold" type="number" min={0} {...register('lowStockThreshold')} /></Field>
          {!product && <Field id="p-stock" label="Opening stock" error={errors.initialStock?.message}><Input id="p-stock" type="number" min={0} {...register('initialStock')} /></Field>}
        </div>
        <Field id="p-desc" label="Description" error={errors.description?.message}><Textarea id="p-desc" rows={3} {...register('description')} /></Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
