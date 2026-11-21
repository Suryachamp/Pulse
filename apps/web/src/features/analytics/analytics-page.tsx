import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { useUrlState } from '@/hooks/use-url-state';
import { money, number, sentence } from '@/lib/utils';
import type { Breakdown, PeriodMetrics, Series, Summary } from '@/types/api';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui/feedback';
import { BarList, RevenueChart } from '@/components/charts/revenue-chart';
import { Delta } from '@/components/charts/delta';
import { DateRangePicker, resolveRange, type Preset } from '@/components/shared/date-range';

const DEFAULTS = { preset: '30d', from: '', to: '' };

const METRICS: { key: keyof PeriodMetrics; label: string; fmt: (n: number) => string; inverse?: boolean; hint: string }[] = [
  { key: 'netRevenueCents', label: 'Net revenue', fmt: money, hint: 'Collected minus refunds' },
  { key: 'bookedSalesCents', label: 'Booked sales', fmt: money, hint: 'Confirmed orders, excluding cancellations' },
  { key: 'collectedCents', label: 'Collected', fmt: money, hint: 'Payments received' },
  { key: 'refundedCents', label: 'Refunds', fmt: money, inverse: true, hint: 'Money returned' },
  { key: 'orderCount', label: 'Orders', fmt: number, hint: 'Confirmed in this period' },
  { key: 'averageOrderCents', label: 'Average order', fmt: money, hint: 'Booked sales ÷ orders' },
];

function Section({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className ?? ''}`} aria-label={title}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-faint">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AnalyticsPage() {
  const [f, set] = useUrlState(DEFAULTS);
  const range = resolveRange(f.preset as Preset, f.from, f.to);
  const params = { from: range.from.toISOString(), to: range.to.toISOString() };
  const rangeKey = [format(range.from, 'yyyy-MM-dd'), format(range.to, 'yyyy-MM-dd-HH')];

  const summary = useQuery({ queryKey: ['analytics', 'summary', rangeKey], queryFn: () => api.get<Summary>('/analytics/summary', params) });
  const series = useQuery({ queryKey: ['analytics', 'series', rangeKey], queryFn: () => api.get<Series>('/analytics/timeseries', params) });
  const breakdown = useQuery({ queryKey: ['analytics', 'breakdown', rangeKey], queryFn: () => api.get<Breakdown>('/analytics/breakdown', params) });

  return (
    <div>
      <PageHeader title="Analytics" description="Every figure is calculated from recorded orders and payments. Changes compare with the previous period of the same length." />
      <div className="mb-6"><DateRangePicker preset={f.preset as Preset} from={f.from} to={f.to} onChange={(v) => set(v)} /></div>

      {summary.isError ? <div className="panel mb-6"><ErrorState error={summary.error} onRetry={() => summary.refetch()} /></div> : (
        <dl className="panel mb-6 grid grid-cols-2 divide-line/60 md:grid-cols-3 xl:grid-cols-6 xl:divide-x">
          {METRICS.map((m) => (
            <div key={m.key} className="border-b border-line/40 px-5 py-4 xl:border-b-0" title={m.hint}>
              <dt className="text-xs text-faint">{m.label}</dt>
              {summary.data ? (
                <>
                  <dd className="tnum mt-1 text-xl font-semibold">{m.fmt(summary.data.current[m.key])}</dd>
                  <dd className="mt-0.5"><Delta current={summary.data.current[m.key]} previous={summary.data.previous[m.key]} inverse={m.inverse} /></dd>
                  <dd className="tnum truncate text-2xs text-faint">was {m.fmt(summary.data.previous[m.key])}</dd>
                </>
              ) : <dd><Skeleton className="mt-2 h-6 w-24" /><Skeleton className="mt-2 h-3 w-16" /></dd>}
            </div>
          ))}
        </dl>
      )}

      <Section title="Revenue over time" description={series.data ? `Grouped by ${series.data.unit}` : undefined} className="mb-6">
        {series.isLoading ? <Skeleton className="h-[300px] w-full" /> : series.isError ? <ErrorState error={series.error} onRetry={() => series.refetch()} /> : series.data && (
          <RevenueChart points={series.data.points} unit={series.data.unit} series={['collected', 'booked', 'refunded']} height={300} />
        )}
      </Section>

      {breakdown.isError ? <div className="panel"><ErrorState error={breakdown.error} onRetry={() => breakdown.refetch()} /></div> : !breakdown.data ? (
        <div className="grid gap-6 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Top products" description="By revenue from orders fulfilled in this period">
            {breakdown.data.topProducts.length ? <BarList format={money} rows={breakdown.data.topProducts.map((p) => ({ label: p.name, sub: `${p.units} units`, value: p.revenueCents }))} /> : <p className="text-sm text-mist">No fulfilled orders in this period.</p>}
          </Section>
          <Section title="Orders by status" description="Orders created in this period, by where they are now">
            {breakdown.data.ordersByStatus.length ? <BarList format={(n) => `${number(n)} orders`} rows={breakdown.data.ordersByStatus.map((s) => ({ label: sentence(s.status), sub: money(s.totalCents), value: s.count }))} /> : <p className="text-sm text-mist">No orders created in this period.</p>}
          </Section>
          <Section title="Payment collection" description="Payments received in this period, by method">
            {breakdown.data.methods.length ? <BarList format={money} rows={breakdown.data.methods.map((m) => ({ label: sentence(m.method), sub: `${m.count} payments`, value: m.cents }))} /> : <p className="text-sm text-mist">No payments received in this period.</p>}
          </Section>
          <Section title="Receivables aging" description="Unpaid balances today, by days since the order was confirmed">
            <BarList format={money} rows={breakdown.data.aging.map((a) => ({ label: `${a.bucket} days`, sub: `${a.orders} orders`, value: a.cents }))} />
          </Section>
          <Section title="Inventory health" description="Current stock across active products" className="lg:col-span-2">
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Products', number(breakdown.data.inventory.products)],
                ['Units on hand', number(breakdown.data.inventory.units)],
                ['Units reserved', number(breakdown.data.inventory.reserved)],
                ['Stock value at cost', money(breakdown.data.inventory.costValue)],
                ['Stock value at retail', money(breakdown.data.inventory.retailValue)],
                ['Low or out of stock', `${breakdown.data.inventory.low + breakdown.data.inventory.out}`],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-xs text-faint">{k}</dt><dd className="tnum mt-1 text-lg font-semibold">{v}</dd></div>
              ))}
            </dl>
          </Section>
        </div>
      )}
    </div>
  );
}
