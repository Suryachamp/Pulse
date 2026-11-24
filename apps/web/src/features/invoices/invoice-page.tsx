import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Printer } from 'lucide-react';
import { formatMoney, type InvoiceStatus } from '@pulse/shared';
import { api, ApiError } from '@/lib/api';
import { cn, date, sentence } from '@/lib/utils';
import type { Invoice } from '@/types/api';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';

/*
 * The invoice is a paper document, so it is always rendered light, with fixed
 * neutral colours, regardless of the app's dark theme. The toolbar is hidden in print.
 */

const STAMP: Record<InvoiceStatus, { label: string; className: string }> = {
  DUE: { label: 'Due', className: 'border-neutral-400 text-neutral-700' },
  OVERDUE: { label: 'Overdue', className: 'border-red-700 text-red-700' },
  PAID: { label: 'Paid', className: 'border-emerald-700 text-emerald-700' },
  VOID: { label: 'Void', className: 'border-red-700 text-red-700' },
};

function Lines({ text }: { text: string | null }) {
  return text ? <span className="whitespace-pre-line">{text}</span> : null;
}

function Row({ label, value, className, testId }: { label: string; value: string; className?: string; testId?: string }) {
  const strong = !!className?.includes('font-semibold');
  return (
    <div className={cn('flex justify-between gap-6', className)}>
      <dt className={strong ? undefined : 'text-neutral-500'}>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  );
}

function Shell({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[52rem] items-center justify-between gap-3 print:hidden">
        <Link to={`/app/orders/${id}`} className="inline-flex items-center gap-1.5 text-sm text-mist hover:text-ink"><ArrowLeft className="size-4" />Back to order</Link>
        <Button variant="primary" onClick={() => window.print()}><Printer />Print or save PDF</Button>
      </div>
      {children}
    </div>
  );
}

export default function InvoicePage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api.get<Invoice>(`/orders/${id}/invoice`) });

  if (q.isLoading) return <Shell id={id}><Skeleton className="mx-auto h-[60rem] max-w-[52rem]" /></Shell>;
  if (q.isError) {
    const e = q.error;
    const body = e instanceof ApiError && e.body.code === 'INVOICE_NOT_AVAILABLE'
      ? <EmptyState icon={FileText} title="No invoice yet" description="Confirm the order to issue its invoice." action={<Button asChild><Link to={`/app/orders/${id}`}>Back to order</Link></Button>} />
      : e instanceof ApiError && e.status === 404
        ? <EmptyState icon={FileText} title="Invoice not found" description="It may belong to another workspace." action={<Button asChild><Link to="/app/orders">Back to orders</Link></Button>} />
        : <div className="panel"><ErrorState error={e} onRetry={() => q.refetch()} /></div>;
    return <Shell id={id}><div className="mx-auto max-w-[52rem]">{body}</div></Shell>;
  }

  const inv = q.data!;
  const m = (cents: number) => formatMoney(cents, inv.currency);
  const stamp = STAMP[inv.invoiceStatus];

  return (
    <Shell id={id}>
      <article
        aria-label={`Invoice ${inv.number}`}
        className="relative mx-auto max-w-[52rem] rounded-xl bg-white px-6 py-8 text-[0.875rem] text-neutral-900 shadow-lift sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:px-0 print:py-0 print:shadow-none"
      >
        <header className="flex flex-col gap-6 border-b border-neutral-200 pb-8 sm:flex-row sm:justify-between">
          <div>
            <p className="text-lg font-semibold">{inv.seller.name}</p>
            <p className="mt-1 leading-relaxed text-neutral-600"><Lines text={inv.seller.address} /></p>
            <p className="text-neutral-600">{[inv.seller.email, inv.seller.phone].filter(Boolean).join(' · ')}</p>
            {inv.seller.taxId && <p className="text-neutral-600">Tax ID {inv.seller.taxId}</p>}
          </div>
          <div className="sm:text-right">
            <h1 className="font-display text-4xl leading-none">Invoice</h1>
            <p className="mt-2 text-neutral-600">No. {String(inv.number).padStart(5, '0')}</p>
            <p className={cn('mt-3 inline-block rounded border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-widest', stamp.className)} data-testid="invoice-status">{stamp.label}</p>
          </div>
        </header>

        <section className="grid gap-6 py-8 sm:grid-cols-2" aria-label="Parties and dates">
          <div>
            <h2 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-neutral-500">Bill to</h2>
            <p className="font-medium">{inv.customer.name}</p>
            {inv.customer.company && <p>{inv.customer.company}</p>}
            <p className="leading-relaxed text-neutral-600"><Lines text={inv.customer.address} /></p>
            <p className="text-neutral-600">{[inv.customer.email, inv.customer.phone].filter(Boolean).join(' · ')}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 self-start sm:justify-self-end">
            <dt className="text-neutral-500">Issued</dt><dd className="sm:text-right">{date(inv.issuedAt)}</dd>
            <dt className="text-neutral-500">Due</dt><dd className="sm:text-right">{date(inv.dueAt)}</dd>
            <dt className="text-neutral-500">Terms</dt><dd className="sm:text-right">{inv.paymentTermsDays === 0 ? 'Due on receipt' : `Net ${inv.paymentTermsDays}`}</dd>
            {inv.cancelledAt && <><dt className="text-neutral-500">Voided</dt><dd className="sm:text-right">{date(inv.cancelledAt)}</dd></>}
          </dl>
        </section>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-300 text-2xs uppercase tracking-wider text-neutral-500">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="hidden py-2 text-right font-semibold sm:table-cell">Unit price</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((i) => (
              <tr key={i.id} className="border-b border-neutral-100 align-top">
                <td className="py-3 pr-4"><span className="font-medium">{i.productName}</span><span className="block text-xs text-neutral-500">{i.sku}<span className="sm:hidden"> · {m(i.unitPriceCents)} each</span></span></td>
                <td className="py-3 text-right">{i.quantity}</td>
                <td className="hidden py-3 text-right sm:table-cell">{m(i.unitPriceCents)}</td>
                <td className="py-3 text-right">{m(i.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-6 max-w-xs space-y-1.5">
          <Row label="Subtotal" value={m(inv.subtotalCents)} />
          {inv.discountCents > 0 && <Row label="Discount" value={`−${m(inv.discountCents)}`} />}
          <Row label={`Tax (${inv.taxRateBps / 100}%)`} value={m(inv.taxCents)} />
          <Row label="Total" value={m(inv.totalCents)} className="border-t border-neutral-300 pt-2 font-semibold" />
          {inv.paidCents > 0 && <Row label="Paid" value={`−${m(inv.paidCents)}`} />}
          {inv.refundedCents > 0 && <Row label="Refunded" value={m(inv.refundedCents)} />}
          <Row label="Balance due" value={m(inv.balanceDueCents)} className="border-t-2 border-neutral-900 pt-2 text-base font-semibold" testId="balance-due" />
        </dl>

        {inv.payments.length > 0 && (
          <section className="mt-10" aria-label="Payments received">
            <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-neutral-500">Payments</h2>
            <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
              {inv.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-4 py-2">
                  <span>{date(p.receivedAt)} · {p.kind === 'REFUND' ? 'Refund' : sentence(p.method)}{p.reference && <span className="text-neutral-500"> · {p.reference}</span>}</span>
                  <span>{p.kind === 'REFUND' ? '−' : ''}{m(p.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {inv.seller.footer && <footer className="mt-10 border-t border-neutral-200 pt-6 text-neutral-600"><Lines text={inv.seller.footer} /></footer>}
      </article>
    </Shell>
  );
}
