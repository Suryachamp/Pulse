import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Minus, PackageSearch, Plus, Trash2 } from 'lucide-react';
import { calculateOrderTotals, toCents } from '@pulse/shared';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { applyServerErrors } from '@/lib/forms';
import { cn, money } from '@/lib/utils';
import type { CustomerDetail, CustomerRow, OrderDetail, Paginated, Product } from '@/types/api';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { AsyncPicker } from '@/components/shared/async-picker';

const formSchema = z.object({
  customerId: z.string().uuid({ message: 'Select a customer' }),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().int().min(1, 'At least 1').max(100_000) })).min(1, 'Add at least one product'),
  discount: z.string().trim().refine((v) => v === '' || toCents(v) >= 0, 'Enter an amount like 5.00'),
  taxRate: z.string().trim().refine((v) => v === '' || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100), 'Enter a percentage like 8.25'),
  notes: z.string().max(2000),
});
type FormValues = z.input<typeof formSchema>;

interface LineMeta { name: string; sku: string; priceCents: number; available: number | null }

export default function OrderEditorPage() {
  const { id } = useParams();
  const editing = !!id;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useSession();
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, LineMeta>>({});

  const existing = useQuery({ queryKey: ['order', id], queryFn: () => api.get<OrderDetail>(`/orders/${id}`), enabled: editing });
  const presetCustomerId = params.get('customerId');
  const preset = useQuery({ queryKey: ['customer', presetCustomerId], queryFn: () => api.get<CustomerDetail>(`/customers/${presetCustomerId}`), enabled: !editing && !!presetCustomerId });

  const { control, register, handleSubmit, reset, setValue, watch, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { customerId: '', items: [], discount: '', taxRate: ((me?.organization?.defaultTaxRateBps ?? 0) / 100).toString(), notes: '' },
  });
  const items = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    const o = existing.data;
    if (!o) return;
    setCustomerName(o.customer.name);
    setMeta(Object.fromEntries(o.items.map((i) => [i.productId, { name: i.productName, sku: i.sku, priceCents: i.unitPriceCents, available: null }])));
    reset({ customerId: o.customer.id, items: o.items.map((i) => ({ productId: i.productId, quantity: i.quantity })), discount: o.discountCents ? (o.discountCents / 100).toFixed(2) : '', taxRate: (o.taxRateBps / 100).toString(), notes: o.notes ?? '' });
  }, [existing.data, reset]);

  useEffect(() => {
    if (preset.data) { setValue('customerId', preset.data.id); setCustomerName(preset.data.name); }
  }, [preset.data, setValue]);

  const watched = watch();
  // Preview only: the server recalculates from catalog prices when the order is saved.
  const preview = useMemo(() => calculateOrderTotals({
    items: (watched.items ?? []).map((i) => ({ unitPriceCents: meta[i.productId]?.priceCents ?? 0, quantity: Number(i.quantity) || 0 })),
    discountCents: watched.discount ? Math.max(0, toCents(watched.discount) || 0) : 0,
    taxRateBps: watched.taxRate ? Math.round(Number(watched.taxRate) * 100) || 0 : 0,
  }), [watched, meta]);

  const save = useMutation({
    mutationFn: (raw: FormValues) => {
      const v = formSchema.parse(raw);
      const body = { customerId: v.customerId, items: v.items, discountCents: v.discount ? toCents(v.discount) : 0, taxRateBps: v.taxRate ? Math.round(Number(v.taxRate) * 100) : 0, notes: v.notes };
      return editing ? api.put<{ id: string }>(`/orders/${id}`, body) : api.post<{ id: string }>('/orders', body);
    },
    onSuccess: (o) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', o.id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(editing ? 'Draft saved' : 'Draft order created', { description: 'Confirm it to reserve stock.' });
      navigate(`/app/orders/${o.id}`);
    },
    onError: (err) => applyServerErrors(err, setError, ['customerId', 'items', 'notes']),
  });

  if (editing && existing.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-56" /><Skeleton className="h-96 w-full" /></div>;
  if (editing && existing.isError) return <div className="panel"><ErrorState error={existing.error} onRetry={() => existing.refetch()} /></div>;
  if (editing && existing.data && existing.data.status !== 'DRAFT') {
    return <EmptyState icon={PackageSearch} title="This order can no longer be edited" description="Only drafts can change. Confirmed orders have already reserved stock." action={<Button asChild><Link to={`/app/orders/${id}`}>View order</Link></Button>} />;
  }

  const addProduct = (p: Product) => {
    setMeta((m) => ({ ...m, [p.id]: { name: p.name, sku: p.sku, priceCents: p.priceCents, available: p.available } }));
    items.append({ productId: p.id, quantity: 1 });
  };
  const chosen = new Set(watched.items?.map((i) => i.productId));
  const onSubmit = handleSubmit((v) => save.mutate(v));

  return (
    <div>
      <Link to={editing ? `/app/orders/${id}` : '/app/orders'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-ink"><ArrowLeft className="size-4" />{editing ? 'Back to order' : 'Orders'}</Link>
      <PageHeader title={editing ? `Edit draft #${existing.data?.number}` : 'New order'} description="Orders start as drafts. Nothing is reserved until you confirm." />
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_22rem]" noValidate>
        <div className="space-y-6">
          <section className="panel p-5" aria-label="Customer">
            <Field id="o-customer" label="Customer" error={errors.customerId?.message}>
              <Controller control={control} name="customerId" render={({ field }) => (
                <AsyncPicker<CustomerRow>
                  id="o-customer"
                  queryKey="customers"
                  invalid={!!errors.customerId}
                  placeholder="Search customers…"
                  fetch={async (q) => (await api.get<Paginated<CustomerRow>>('/customers', { q, pageSize: 20, sort: 'name', dir: 'asc' })).data}
                  getKey={(c) => c.id}
                  renderItem={(c) => <><span className="flex-1 truncate">{c.name}</span><span className="truncate text-xs text-faint">{c.company ?? c.email}</span></>}
                  onSelect={(c) => { field.onChange(c.id); setCustomerName(c.name); }}
                  trigger={customerName ?? <span className="text-faint">Choose a customer</span>}
                />
              )} />
            </Field>
          </section>

          <section className="panel" aria-label="Products">
            <div className="flex flex-col gap-3 border-b border-line/60 p-5 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold">Products</h2>
              <div className="sm:w-80">
                <AsyncPicker<Product>
                  queryKey="products"
                  placeholder="Search by name or SKU…"
                  fetch={async (q) => (await api.get<Paginated<Product>>('/products', { q, pageSize: 20, status: 'active' })).data}
                  getKey={(p) => p.id}
                  isDisabled={(p) => chosen.has(p.id)}
                  renderItem={(p) => <><span className="flex-1 truncate">{p.name}<span className="ml-2 text-xs text-faint">{p.sku}</span></span><span className={cn('tnum text-xs', p.available <= 0 ? 'text-rose' : 'text-faint')}>{p.available} avail.</span><span className="tnum text-xs text-mist">{money(p.priceCents)}</span></>}
                  onSelect={addProduct}
                  trigger={<span className="flex items-center gap-2 text-mist"><Plus className="size-4" />Add product</span>}
                />
              </div>
            </div>
            {items.fields.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <PackageSearch className="mx-auto mb-3 size-6 text-faint" aria-hidden />
                <p className="text-sm text-mist">Add products to build the order.</p>
                {errors.items?.message && <p role="alert" className="mt-2 text-xs text-rose">{errors.items.message}</p>}
              </div>
            ) : (
              <ul className="divide-y divide-line/50">
                {items.fields.map((f, idx) => {
                  const m = meta[f.productId];
                  const qty = Number(watched.items?.[idx]?.quantity) || 0;
                  const over = m?.available !== null && m?.available !== undefined && qty > m.available;
                  return (
                    <li key={f.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m?.name}</p>
                        <p className="text-xs text-faint">{m?.sku} · {money(m?.priceCents ?? 0)} each{m?.available !== null && m?.available !== undefined && ` · ${m.available} available`}</p>
                        {over && <p className="mt-0.5 text-xs text-brass">More than is available now. Confirming will fail unless stock is added.</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="icon-sm" variant="ghost" aria-label="Decrease quantity" onClick={() => setValue(`items.${idx}.quantity`, Math.max(1, qty - 1))}><Minus /></Button>
                        <Input aria-label={`Quantity of ${m?.name}`} type="number" min={1} className="tnum h-8 w-16 text-center" {...register(`items.${idx}.quantity`)} />
                        <Button type="button" size="icon-sm" variant="ghost" aria-label="Increase quantity" onClick={() => setValue(`items.${idx}.quantity`, qty + 1)}><Plus /></Button>
                      </div>
                      <span className="tnum w-24 text-right text-sm">{money((m?.priceCents ?? 0) * qty)}</span>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${m?.name}`} onClick={() => items.remove(idx)}><Trash2 /></Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel p-5" aria-label="Notes">
            <Field id="o-notes" label="Notes" hint="Visible to your team on the order." error={errors.notes?.message}><Textarea id="o-notes" rows={3} {...register('notes')} /></Field>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <section className="panel p-5" aria-label="Summary">
            <h2 className="mb-4 text-sm font-semibold">Summary</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field id="o-discount" label="Discount ($)" error={errors.discount?.message}><Input id="o-discount" inputMode="decimal" placeholder="0.00" {...register('discount')} /></Field>
              <Field id="o-tax" label="Tax rate (%)" error={errors.taxRate?.message}><Input id="o-tax" inputMode="decimal" {...register('taxRate')} /></Field>
            </div>
            <dl className="tnum mt-5 space-y-2 border-t border-line/60 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-mist">Subtotal</dt><dd>{money(preview.subtotalCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-mist">Discount</dt><dd>−{money(preview.discountCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-mist">Tax</dt><dd>{money(preview.taxCents)}</dd></div>
              <div className="flex justify-between border-t border-line/60 pt-3 text-base font-semibold"><dt>Total</dt><dd>{money(preview.totalCents)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-faint">Prices come from your catalog and are fixed on the order when it’s saved.</p>
            <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" loading={save.isPending}>{editing ? 'Save draft' : 'Create draft order'}</Button>
            {save.error instanceof ApiError && save.error.status >= 500 && <p className="mt-2 text-xs text-rose">{save.error.message}</p>}
          </section>
        </aside>
      </form>
    </div>
  );
}
