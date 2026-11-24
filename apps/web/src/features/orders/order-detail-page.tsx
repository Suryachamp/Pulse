import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, CreditCard, FileText, Pencil, RotateCcw, ShoppingBag, Undo2 } from 'lucide-react';
import type { OrderStatus } from '@pulse/shared';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cn, dateTime, money, sentence } from '@/lib/utils';
import type { OrderDetail } from '@/types/api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, EmptyState, ErrorState, OrderStatusBadge, PaymentStatusBadge, Skeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Timeline } from '@/components/shared/timeline';
import { PaymentDialog } from './payment-dialog';

const STEPS: { status: OrderStatus; label: string; at: keyof OrderDetail }[] = [
  { status: 'DRAFT', label: 'Draft', at: 'createdAt' },
  { status: 'CONFIRMED', label: 'Confirmed', at: 'confirmedAt' },
  { status: 'FULFILLED', label: 'Fulfilled', at: 'fulfilledAt' },
  { status: 'COMPLETED', label: 'Completed', at: 'completedAt' },
];

const ACTIONS: Record<Exclude<OrderStatus, 'DRAFT'>, { label: string; title: string; body: string; done: string }> = {
  CONFIRMED: { label: 'Confirm order', title: 'Confirm this order?', body: 'Stock for every item will be reserved so it can’t be sold to anyone else. The order can no longer be edited.', done: 'Order confirmed. Stock reserved.' },
  FULFILLED: { label: 'Mark fulfilled', title: 'Mark as fulfilled?', body: 'Reserved units are removed from on-hand stock. Fulfilled orders can’t be cancelled.', done: 'Order fulfilled' },
  COMPLETED: { label: 'Complete order', title: 'Complete this order?', body: 'Completing closes the order. Any outstanding balance stays on the books as a receivable.', done: 'Order completed' },
  CANCELLED: { label: 'Cancel order', title: 'Cancel this order?', body: 'Any reserved stock is released back to inventory. Payments already recorded stay on the order so you can refund them.', done: 'Order cancelled' },
};

function Stepper({ order }: { order: OrderDetail }) {
  const cancelled = order.status === 'CANCELLED';
  const current = STEPS.findIndex((s) => s.status === order.status);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const at = order[s.at] as string | null;
        const reached = !!at && (cancelled || i <= current);
        return (
          <li key={s.status} className="min-w-0" aria-current={i === current ? 'step' : undefined}>
            <div className={cn('h-1 rounded-full', reached ? (cancelled ? 'bg-faint' : 'bg-brass') : 'bg-raised')} />
            <p className={cn('mt-2 flex items-center gap-1 text-xs font-medium', reached ? 'text-ink' : 'text-faint')}>{reached && <Check className="size-3" aria-hidden />}{s.label}</p>
            <p className="truncate text-2xs text-faint">{at ? dateTime(at) : '—'}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const { can } = useSession();
  const qc = useQueryClient();
  const [pending, setPending] = useState<Exclude<OrderStatus, 'DRAFT'> | null>(null);
  const [reason, setReason] = useState('');
  const [payment, setPayment] = useState<'PAYMENT' | 'REFUND' | null>(null);
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api.get<OrderDetail>(`/orders/${id}`) });

  const transition = useMutation({
    mutationFn: (status: OrderStatus) => api.post(`/orders/${id}/transitions`, { status, reason: status === 'CANCELLED' ? reason || undefined : undefined }),
    onSuccess: (_d, status) => {
      for (const k of ['order', 'orders', 'products', 'product', 'dashboard', 'customer', 'notifications']) qc.invalidateQueries({ queryKey: [k] });
      toast.success(ACTIONS[status as Exclude<OrderStatus, 'DRAFT'>].done);
      setPending(null);
      setReason('');
    },
    onError: (err) => {
      setPending(null);
      toast.error(err instanceof ApiError && err.body.code === 'INSUFFICIENT_STOCK' ? 'Not enough stock to confirm' : 'Could not update the order', { description: errorMessage(err) });
    },
  });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) return <EmptyState icon={ShoppingBag} title="Order not found" description="It may belong to another workspace." action={<Button asChild><Link to="/app/orders">Back to orders</Link></Button>} />;
    return <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div>;
  }
  const o = q.data!;
  const net = o.paidCents - o.refundedCents;
  const actions = o.allowedTransitions.filter((s): s is Exclude<OrderStatus, 'DRAFT'> => s !== 'DRAFT' && (s !== 'CANCELLED' || can('orders:cancel')) && can('orders:write'));
  const payable = ['CONFIRMED', 'FULFILLED', 'COMPLETED'].includes(o.status) && o.outstandingCents > 0;

  return (
    <div>
      <Link to="/app/orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-mist hover:text-ink"><ArrowLeft className="size-4" />Orders</Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="tnum flex flex-wrap items-center gap-3 text-[1.625rem] font-semibold leading-tight tracking-[-0.015em]">
            Order #{o.number} <OrderStatusBadge status={o.status} /> <PaymentStatusBadge status={o.paymentStatus} />
          </h1>
          <p className="mt-1 text-sm text-mist">
            <Link to={`/app/customers/${o.customer.id}`} className="text-ink hover:text-brass">{o.customer.name}</Link>
            {o.customer.company && ` · ${o.customer.company}`} · created by {o.createdBy?.name ?? 'a former member'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {o.status === 'DRAFT' && can('orders:write') && <Button asChild><Link to={`/app/orders/${o.id}/edit`}><Pencil />Edit draft</Link></Button>}
          {o.status !== 'DRAFT' && <Button asChild variant="outline"><Link to={`/app/orders/${o.id}/invoice`}><FileText />Invoice</Link></Button>}
          {actions.map((s) => (
            <Button key={s} variant={s === 'CANCELLED' ? 'outline' : 'primary'} className={s === 'CANCELLED' ? 'text-rose' : undefined} onClick={() => setPending(s)}>
              {s === 'CANCELLED' ? <RotateCcw /> : <Check />}{ACTIONS[s].label}
            </Button>
          ))}
        </div>
      </div>

      <section className="panel mb-6 p-5"><Stepper order={o} />
        {o.status === 'CANCELLED' && <p className="mt-4 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose">Cancelled {o.cancelledAt && dateTime(o.cancelledAt)}{o.cancelReason && `: ${o.cancelReason}`}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="panel" aria-label="Items">
            <h2 className="px-5 pb-2 pt-4 text-sm font-semibold">Items</h2>
            <Table>
              <thead><tr><Th>Product</Th><Th className="text-right">Unit price</Th><Th className="text-right">Qty</Th><Th className="text-right">Line total</Th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <Tr key={i.id}>
                    <Td><Link to={`/app/inventory/${i.productId}`} className="font-medium hover:text-brass">{i.productName}</Link><span className="block text-xs text-faint">{i.sku}</span></Td>
                    <Td className="tnum text-right">{money(i.unitPriceCents)}</Td>
                    <Td className="tnum text-right">{i.quantity}</Td>
                    <Td className="tnum text-right">{money(i.lineTotalCents)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <dl className="tnum ml-auto max-w-xs space-y-1.5 px-5 py-4 text-sm">
              <div className="flex justify-between"><dt className="text-mist">Subtotal</dt><dd>{money(o.subtotalCents)}</dd></div>
              {o.discountCents > 0 && <div className="flex justify-between"><dt className="text-mist">Discount</dt><dd>−{money(o.discountCents)}</dd></div>}
              <div className="flex justify-between"><dt className="text-mist">Tax ({(o.taxRateBps / 100).toString()}%)</dt><dd>{money(o.taxCents)}</dd></div>
              <div className="flex justify-between border-t border-line/60 pt-2 text-base font-semibold"><dt>Total</dt><dd>{money(o.totalCents)}</dd></div>
            </dl>
            {o.notes && <p className="whitespace-pre-line border-t border-line/60 px-5 py-4 text-sm text-mist">{o.notes}</p>}
          </section>

          <section className="panel p-5" aria-label="History">
            <h2 className="mb-4 text-sm font-semibold">History</h2>
            <Timeline entries={o.history} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5" aria-label="Payments">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Payments</h2>
              <PaymentStatusBadge status={o.paymentStatus} />
            </div>
            <dl className="tnum space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-mist">Collected</dt><dd>{money(o.paidCents)}</dd></div>
              {o.refundedCents > 0 && <div className="flex justify-between"><dt className="text-mist">Refunded</dt><dd className="text-rose">−{money(o.refundedCents)}</dd></div>}
              <div className="flex justify-between border-t border-line/60 pt-2 font-semibold"><dt>Outstanding</dt><dd className={o.outstandingCents ? 'text-brass' : ''}>{money(o.outstandingCents)}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {can('payments:record') && payable && <Button variant="primary" size="sm" onClick={() => setPayment('PAYMENT')}><CreditCard />Record payment</Button>}
              {can('payments:refund') && net > 0 && <Button size="sm" onClick={() => setPayment('REFUND')}><Undo2 />Refund</Button>}
            </div>
            {o.status === 'DRAFT' && <p className="mt-3 text-xs text-faint">Confirm the order before recording payments.</p>}
            {o.payments.length > 0 && (
              <ul className="mt-5 divide-y divide-line/50 border-t border-line/60">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm">{sentence(p.method)}{p.kind === 'REFUND' && <Badge tone="rose">Refund</Badge>}</p>
                      <p className="truncate text-xs text-faint">{dateTime(p.receivedAt)}{p.reference && ` · ${p.reference}`}</p>
                      {p.recordedBy && <p className="text-xs text-faint">by {p.recordedBy.name}</p>}
                    </div>
                    <span className={cn('tnum text-sm font-medium', p.kind === 'REFUND' && 'text-rose')}>{p.kind === 'REFUND' ? '−' : ''}{money(p.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel p-5 text-sm" aria-label="Customer">
            <h2 className="mb-3 font-semibold">Customer</h2>
            <p>{o.customer.name}</p>
            {o.customer.email && <a className="block text-mist hover:text-brass" href={`mailto:${o.customer.email}`}>{o.customer.email}</a>}
            {o.customer.phone && <p className="text-mist">{o.customer.phone}</p>}
          </section>
        </aside>
      </div>

      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setPending(null); }}
          title={ACTIONS[pending].title}
          description={ACTIONS[pending].body}
          confirmLabel={ACTIONS[pending].label}
          destructive={pending === 'CANCELLED'}
          loading={transition.isPending}
          onConfirm={() => transition.mutate(pending)}
        >
          {pending === 'CANCELLED' && <Field id="cancel-reason" label="Reason (optional)"><Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer changed their mind" /></Field>}
        </ConfirmDialog>
      )}
      {payment && <PaymentDialog open onOpenChange={(open) => { if (!open) setPayment(null); }} orderId={o.id} orderNumber={o.number} kind={payment} maxCents={payment === 'PAYMENT' ? o.outstandingCents : net} />}
    </div>
  );
}
