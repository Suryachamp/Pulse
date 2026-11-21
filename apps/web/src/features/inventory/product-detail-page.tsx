import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ArrowLeft, Boxes, MoreHorizontal, PackagePlus, Pencil, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, dateTime, money, sentence } from '@/lib/utils';
import type { ProductDetail } from '@/types/api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { ProductForm } from './product-form';
import { AdjustStockDialog } from './adjust-dialog';
import { StockMeter, stockLabel } from './stock-meter';

const MOVE_TONE = { INITIAL: 'faint', RESTOCK: 'sage', ADJUSTMENT: 'neutral', RESERVE: 'slate', RELEASE: 'faint', FULFILL: 'brass' } as const;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export default function ProductDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const q = useQuery({ queryKey: ['product', id], queryFn: () => api.get<ProductDetail>(`/products/${id}`) });

  const archive = useMutation({
    mutationFn: (archived: boolean) => api.post(`/products/${id}/${archived ? 'archive' : 'restore'}`),
    onSuccess: (_d, archived) => { qc.invalidateQueries({ queryKey: ['product', id] }); qc.invalidateQueries({ queryKey: ['products'] }); toast.success(archived ? 'Product archived' : 'Product restored'); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Product deleted'); navigate('/app/inventory'); },
    onError: (err) => { setConfirmDelete(false); toast.error(errorMessage(err)); },
  });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-32 w-full" /><Skeleton className="h-80 w-full" /></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <EmptyState icon={Boxes} title="Product not found" description="It may have been deleted." action={<Button asChild><Link to="/app/inventory">Back to inventory</Link></Button>} />;
    return <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  }
  const p = q.data!;
  const label = stockLabel(p.available, p.lowStockThreshold);
  const margin = p.costCents !== null && p.priceCents > 0 ? Math.round(((p.priceCents - p.costCents) / p.priceCents) * 100) : null;

  return (
    <div>
      <Link to="/app/inventory" className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-ink"><ArrowLeft className="size-4" />Inventory</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-[1.625rem] font-semibold leading-tight tracking-[-0.015em]">
            {p.name} <Badge tone={label.tone}>{label.text}</Badge>{p.archivedAt && <Badge tone="faint">Archived</Badge>}
          </h1>
          <p className="mt-1 text-sm text-mist">{p.sku} · {money(p.priceCents)}{margin !== null && ` · ${margin}% margin`}</p>
        </div>
        <div className="flex gap-2">
          {can('inventory:adjust') && <Button variant="primary" onClick={() => setAdjusting(true)}><PackagePlus />Update stock</Button>}
          {can('products:write') && <Button onClick={() => setEditing(true)}><Pencil />Edit</Button>}
          {can('products:write') && (
            <Menu>
              <MenuTrigger asChild><Button size="icon" aria-label="More actions"><MoreHorizontal /></Button></MenuTrigger>
              <MenuContent>
                {p.archivedAt ? <MenuItem onSelect={() => archive.mutate(false)}><ArchiveRestore />Restore product</MenuItem> : <MenuItem onSelect={() => archive.mutate(true)}><Archive />Archive product</MenuItem>}
                <MenuSeparator />
                <MenuItem danger onSelect={() => setConfirmDelete(true)}><Trash2 />Delete product</MenuItem>
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      <section className="panel mb-6 p-5" aria-label="Stock levels">
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-5">
          {[
            { k: 'Available to sell', v: p.available, strong: true },
            { k: 'On hand', v: p.onHand },
            { k: 'Reserved by orders', v: p.reserved },
            { k: 'Low-stock threshold', v: p.lowStockThreshold },
            { k: 'Units sold', v: p.unitsSold },
          ].map((s) => (
            <div key={s.k}>
              <dt className="text-xs text-faint">{s.k}</dt>
              <dd className={cn('tnum mt-1 font-semibold', s.strong ? 'text-2xl' : 'text-lg')}>{s.v}</dd>
            </div>
          ))}
        </dl>
        <StockMeter className="mt-5 h-2" onHand={p.onHand} reserved={p.reserved} threshold={p.lowStockThreshold} />
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-faint">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-sage" />Available</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-slate/60" />Reserved</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-px bg-ink/40" />Threshold</span>
          <span className="ml-auto">Revenue from fulfilled orders: <span className="tnum text-mist">{money(p.revenueCents)}</span></span>
        </div>
      </section>

      <section className="panel" aria-label="Movement history">
        <h2 className="px-5 pb-2 pt-4 text-sm font-semibold">Movement history</h2>
        {p.movements.length ? (
          <Table>
            <thead><tr><Th>When</Th><Th>Type</Th><Th className="text-right">On hand</Th><Th className="hidden text-right sm:table-cell">Reserved</Th><Th className="hidden md:table-cell">Reason</Th><Th className="hidden lg:table-cell">By</Th></tr></thead>
            <tbody>
              {p.movements.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap text-mist">{dateTime(m.createdAt)}</Td>
                  <Td><Badge tone={MOVE_TONE[m.type]}>{sentence(m.type)}</Badge></Td>
                  <Td className="tnum text-right">{m.onHandDelta !== 0 && <span className={m.onHandDelta > 0 ? 'text-sage' : 'text-rose'}>{signed(m.onHandDelta)} </span>}<span className="text-faint">→ {m.onHandAfter}</span></Td>
                  <Td className="tnum hidden text-right sm:table-cell">{m.reservedDelta !== 0 && <span className="text-slate">{signed(m.reservedDelta)} </span>}<span className="text-faint">→ {m.reservedAfter}</span></Td>
                  <Td className="hidden text-mist md:table-cell">{m.order ? <Link className="hover:text-brass" to={`/app/orders/${m.order.id}`} onClick={(e) => e.stopPropagation()}>{m.reason}</Link> : m.reason ?? '—'}</Td>
                  <Td className="hidden text-mist lg:table-cell">{m.actor?.name ?? 'System'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState icon={Boxes} title="No movements yet" description="Restocks, adjustments and order activity will appear here." />}
      </section>

      <ProductForm open={editing} onOpenChange={setEditing} product={p} />
      <AdjustStockDialog product={p} open={adjusting} onOpenChange={setAdjusting} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${p.name}?`} description="This permanently removes the product and its stock history. Products that appear on orders can only be archived." confirmLabel="Delete product" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}
