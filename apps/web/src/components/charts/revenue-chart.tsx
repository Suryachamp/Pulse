import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { format, parseISO } from 'date-fns';
import { Table as TableIcon, LineChart } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion';
import { cn, money } from '@/lib/utils';
import type { SeriesPoint } from '@/types/api';
import { Button } from '@/components/ui/button';
import { AXIS, SERIES } from './tokens';

type Key = 'collected' | 'booked' | 'refunded';
const LABELS: Record<Key, string> = { collected: 'Collected', booked: 'Booked sales', refunded: 'Refunds' };

function ChartTooltip({ active, payload, label, unit }: TooltipProps<number, string> & { unit: 'day' | 'week' }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="glass min-w-44 rounded-lg border border-line px-3 py-2.5 text-xs shadow-lift">
      <p className="mb-1.5 text-mist">{unit === 'week' ? `Week of ${format(parseISO(String(label)), 'MMM d')}` : format(parseISO(String(label)), 'EEE, MMM d')}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-mist"><span className="size-2 rounded-sm" style={{ background: p.color }} />{LABELS[p.dataKey as Key]}</span>
          <span className="tnum font-medium text-ink">{money(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ points, unit, series = ['collected', 'booked'], height = 260 }: { points: SeriesPoint[]; unit: 'day' | 'week'; series?: Key[]; height?: number }) {
  const id = useId().replace(/:/g, '');
  const reduced = usePrefersReducedMotion();
  const [asTable, setAsTable] = useState(false);
  const tickFmt = (v: string) => format(parseISO(v), unit === 'week' ? 'MMM d' : points.length > 45 ? 'MMM d' : 'd MMM');

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist" aria-label="Legend">
          {series.map((k) => (
            <li key={k} className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded-full" style={{ background: SERIES[k] }} />{LABELS[k]}</li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
          {asTable ? <><LineChart />Chart</> : <><TableIcon />Table</>}
        </Button>
      </div>
      {asTable ? (
        <div className="max-h-[260px] overflow-y-auto rounded-lg border border-line/60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-faint">
              <tr><th className="px-3 py-2 text-left font-medium">{unit === 'week' ? 'Week' : 'Day'}</th>{series.map((k) => <th key={k} className="px-3 py-2 text-right font-medium">{LABELS[k]}</th>)}</tr>
            </thead>
            <tbody className="tnum">
              {[...points].reverse().map((p) => (
                <tr key={p.bucket} className="border-t border-line/40">
                  <td className="px-3 py-1.5 text-mist">{format(parseISO(p.bucket), 'MMM d, yyyy')}</td>
                  {series.map((k) => <td key={k} className="px-3 py-1.5 text-right">{money(p[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={`${series.map((k) => LABELS[k]).join(' and ')} by ${unit}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <defs>
                {series.map((k) => (
                  <linearGradient key={k} id={`${id}-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES[k]} stopOpacity={k === 'collected' ? 0.28 : 0.1} />
                    <stop offset="100%" stopColor={SERIES[k]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke={AXIS.grid} />
              <XAxis dataKey="bucket" tickFormatter={tickFmt} tick={{ fill: AXIS.tick, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} dy={6} />
              <YAxis tickFormatter={(v: number) => money(v, { compact: true })} tick={{ fill: AXIS.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: 'rgb(155 156 166 / 0.35)', strokeWidth: 1 }} />
              {[...series].reverse().map((k) => (
                <Area
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={SERIES[k]}
                  strokeWidth={2}
                  fill={`url(#${id}-${k})`}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#1C1F27' }}
                  dot={false}
                  isAnimationActive={!reduced}
                  animationDuration={700}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Horizontal HTML bars: precise, accessible, and readable on mobile. */
export function BarList({ rows, format: fmt, className }: { rows: { label: string; value: number; sub?: string }[]; format: (v: number) => string; className?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className={cn('space-y-3', className)}>
      {rows.map((r) => (
        <li key={r.label} className="group" title={`${r.label}: ${fmt(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.label}{r.sub && <span className="ml-2 text-xs text-faint">{r.sub}</span>}</span>
            <span className="tnum shrink-0 text-mist">{fmt(r.value)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-raised/80">
            <div className="h-full rounded-full transition-[width] duration-700 ease-out group-hover:brightness-110" style={{ width: `${(r.value / max) * 100}%`, background: SERIES.collected }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
