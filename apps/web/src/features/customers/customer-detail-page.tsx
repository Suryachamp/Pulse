import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ArrowLeft, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { derivePaymentStatus } from '@pulse/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { date, money } from '@/lib/utils';
import type { CustomerDetail } from '@/types/api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, EmptyState, ErrorState, OrderStatusBadge, PaymentStatusBadge, Skeleton } from '@/components/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Timeline } from '@/components/shared/timeline';
import { CustomerForm } from './customer-form';

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const q = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetail>(`/customers/${id}`) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['customer', id] });
    qc.invalidateQueries({ queryKey: ['customers'] });
  };
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.post(`/customers/${id}/${archived ? 'archive' : 'restore'}`),
    onSuccess: (_d, archived) => { refresh(); toast.success(archived ? 'Customer archived' : 'Customer restored'); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/customers/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Customer deleted'); navigate('/app/customers'); },
    onError: (err) => { setConfirmDelete(false); toast.error(errorMessage(err)); },
  });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <EmptyState icon={ShoppingBag} title="Customer not found" description="They may have been deleted, or the link is from another workspace." action={<Button asChild><Link to="/app/customers">Back to customers</Link></Button>} />;
    return <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  }
  const c = q.data!;
  const stats = [
    { label: 'Lifetime value', value: money(c.stats.totalSpentCents) },
    { label: 'Collected', value: money(c.stats.collectedCents) },
    { label: 'Outstanding', value: money(c.stats.outstandingCents), accent: c.stats.outstandingCents > 0 },
    { label: 'Average order', value: money(c.stats.averageOrderCents) },
    { label: 'Orders', value: String(c.stats.orderCount) },
  ];

  return (
    <div>
      <Link to="/app/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-ink"><ArrowLeft className="size-4" />Customers</Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-[1.625rem] font-semibold leading-tight tracking-[-0.015em]">
            {c.name}
            {c.archivedAt && <Badge tone="faint">Archived</Badge>}
          </h1>
          <p className="mt-1 text-sm text-mist">{c.company ?? 'Individual customer'} · since {date(c.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} tone="faint">{t}</Badge>)}</div>
        </div>
        <div className="flex gap-2">
          {can('orders:write') && !c.archivedAt && <Button asChild variant="primary"><Link to={`/app/orders/new?customerId=${c.id}`}><Plus />New order</Link></Button>}
          {can('customers:write') && <Button onClick={() => setEditing(true)}><Pencil />Edit</Button>}
          {can('customers:write') && (
            <Menu>
              <MenuTrigger asChild><Button size="icon" aria-label="More actions"><MoreHorizontal /></Button></MenuTrigger>
              <MenuContent>
                {c.archivedAt ? (
                  <MenuItem onSelect={() => archive.mutate(false)}><ArchiveRestore />Restore customer</MenuItem>
                ) : (
                  <MenuItem onSelect={() => archive.mutate(true)}><Archive />Archive customer</MenuItem>
                )}
                {can('customers:delete') && (
                  <>
                    <MenuSeparator />
                    <MenuItem danger disabled={c.orders.length > 0} onSelect={() => setConfirmDelete(true)}><Trash2 />{c.orders.length ? 'Delete (has orders)' : 'Delete customer'}</MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          )}
        </div>
      </div>

      <dl className="panel mb-6 grid grid-cols-2 divide-line/60 sm:grid-cols-5 sm:divide-x">
        {stats.map((s) => (
          <div key={s.label} className="px-5 py-4">
            <dt className="text-xs text-faint">{s.label}</dt>
            <dd className={`tnum mt-1 text-lg font-semibold ${s.accent ? 'text-brass' : ''}`}>{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="panel" aria-label="Order history">
          <h2 className="px-5 pb-2 pt-4 text-sm font-semibold">Order history</h2>
          {c.orders.length ? (
            <Table>
              <thead><tr><Th>Order</Th><Th>Status</Th><Th className="hidden sm:table-cell">Payment</Th><Th className="text-right">Total</Th><Th className="hidden md:table-cell">Placed</Th></tr></thead>
              <tbody>
                {c.orders.map((o) => (
                  <Tr key={o.id} onClick={() => navigate(`/app/orders/${o.id}`)}>
                    <Td className="tnum font-medium">#{o.number}<span className="block text-xs font-normal text-faint">{o._count.items} items</span></Td>
                    <Td><OrderStatusBadge status={o.status} /></Td>
                    <Td className="hidden sm:table-cell"><PaymentStatusBadge status={derivePaymentStatus(o.totalCents, o.paidCents, o.refundedCents)} /></Td>
                    <Td className="tnum text-right">{money(o.totalCents)}</Td>
                    <Td className="hidden text-mist md:table-cell">{date(o.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState icon={ShoppingBag} title="No orders yet" description="Orders you create for this customer will show here." />}
        </section>

        <div className="space-y-6">
          <section className="panel p-5" aria-label="Contact">
            <h2 className="mb-3 text-sm font-semibold">Contact</h2>
            <ul className="space-y-2.5 text-sm">
              <li className="flex gap-2.5"><Mail className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />{c.email ? <a className="hover:text-brass" href={`mailto:${c.email}`}>{c.email}</a> : <span className="text-faint">No email</span>}</li>
              <li className="flex gap-2.5"><Phone className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />{c.phone ? <a className="hover:text-brass" href={`tel:${c.phone}`}>{c.phone}</a> : <span className="text-faint">No phone</span>}</li>
              <li className="flex gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden /><span className={c.address ? 'whitespace-pre-line' : 'text-faint'}>{c.address ?? 'No address'}</span></li>
            </ul>
            {c.notes && <p className="mt-4 whitespace-pre-line border-t border-line/60 pt-4 text-sm text-mist">{c.notes}</p>}
          </section>
          <section className="panel p-5" aria-label="Activity">
            <h2 className="mb-4 text-sm font-semibold">Activity</h2>
            <Timeline entries={c.timeline} />
          </section>
        </div>
      </div>

      <CustomerForm open={editing} onOpenChange={setEditing} customer={c} />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Delete ${c.name}?`} description="This permanently removes the customer. Customers with orders can only be archived, so their history stays intact." confirmLabel="Delete customer" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}
