import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { PAYMENT_METHODS } from '@pulse/shared';
import { api } from '@/lib/api';
import { useUrlState } from '@/hooks/use-url-state';
import { dateTime, money, sentence } from '@/lib/utils';
import type { Paginated, PaymentRow } from '@/types/api';
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Tabs, TabsList } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { ExportButton } from '@/components/shared/export-button';

const DEFAULTS = { q: '', kind: '', method: '', from: '', to: '', page: '1' };

export default function PaymentsPage() {
  const [f, set] = useUrlState(DEFAULTS);
  const list = useQuery({
    queryKey: ['payments', f],
    queryFn: () => api.get<Paginated<PaymentRow> & { totals: { collectedCents: number; refundedCents: number } }>('/payments', {
      ...f, page: Number(f.page),
      from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined,
      to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined,
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Money received and refunded, recorded against orders. PULSE tracks payments; it doesn’t process cards."
        // Exports the page's date range (same day boundaries as the list).
        actions={<ExportButton dataset="payments" from={f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined} to={f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined} />}
      />
      {list.data && (
        <dl className="panel mb-6 grid grid-cols-3 divide-x divide-line/60">
          <div className="px-5 py-4"><dt className="text-xs text-faint">Collected</dt><dd className="tnum mt-1 text-lg font-semibold">{money(list.data.totals.collectedCents)}</dd></div>
          <div className="px-5 py-4"><dt className="text-xs text-faint">Refunded</dt><dd className="tnum mt-1 text-lg font-semibold text-rose">{money(list.data.totals.refundedCents)}</dd></div>
          <div className="px-5 py-4"><dt className="text-xs text-faint">Net</dt><dd className="tnum mt-1 text-lg font-semibold">{money(list.data.totals.collectedCents - list.data.totals.refundedCents)}</dd></div>
        </dl>
      )}
      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-line/60 p-4 xl:flex-row xl:items-center">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder="Search reference, customer or order #" />
          <Tabs value={f.kind || 'ALL'} onValueChange={(v) => set({ kind: v === 'ALL' ? '' : v })}>
            <TabsList items={[{ value: 'ALL', label: 'All' }, { value: 'PAYMENT', label: 'Payments' }, { value: 'REFUND', label: 'Refunds' }]} />
          </Tabs>
          <Select aria-label="Filter by method" className="xl:w-44" value={f.method || 'ALL'} onValueChange={(v) => set({ method: v === 'ALL' ? '' : v })} options={[{ value: 'ALL', label: 'Any method' }, ...PAYMENT_METHODS.map((m) => ({ value: m, label: sentence(m) }))]} />
          <div className="flex items-center gap-2 xl:ml-auto">
            <Input type="date" aria-label="From date" className="w-40" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} />
            <span className="text-faint">to</span>
            <Input type="date" aria-label="To date" className="w-40" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </div>
        {list.isLoading ? <TableSkeleton /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.data.length ? (
          <EmptyState icon={CreditCard} title="No payments found" description="Payments are recorded from an order’s page once it has been confirmed." />
        ) : (
          <>
            <Table>
              <thead><tr><Th>Received</Th><Th>Order</Th><Th className="hidden md:table-cell">Method</Th><Th className="hidden lg:table-cell">Reference</Th><Th className="text-right">Amount</Th><Th className="hidden lg:table-cell">Recorded by</Th></tr></thead>
              <tbody>
                {list.data.data.map((p) => (
                  <Tr key={p.id}>
                    <Td className="whitespace-nowrap text-mist">{dateTime(p.receivedAt)}</Td>
                    <Td><Link to={`/app/orders/${p.order.id}`} className="tnum font-medium hover:text-brass">#{p.order.number}</Link><span className="block text-xs text-faint">{p.order.customer.name}</span></Td>
                    <Td className="hidden md:table-cell">{sentence(p.method)} {p.kind === 'REFUND' && <Badge tone="rose" className="ml-1">Refund</Badge>}</Td>
                    <Td className="hidden text-mist lg:table-cell">{p.reference ?? '—'}</Td>
                    <Td className={`tnum text-right font-medium ${p.kind === 'REFUND' ? 'text-rose' : ''}`}>{p.kind === 'REFUND' ? '−' : ''}{money(p.amountCents)}</Td>
                    <Td className="hidden text-mist lg:table-cell">{p.recordedBy?.name ?? '—'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} noun="payments" onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
