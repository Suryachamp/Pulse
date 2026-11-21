import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn, percentChange } from '@/lib/utils';

/** Change vs. the previous period. `inverse` marks metrics where up is bad (refunds). */
export function Delta({ current, previous, inverse }: { current: number; previous: number; inverse?: boolean }) {
  const pct = percentChange(current, previous);
  if (pct === null) return <span className="text-xs text-faint">No prior data</span>;
  const flat = Math.abs(pct) < 0.5;
  const good = flat ? null : inverse ? pct < 0 : pct > 0;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('tnum inline-flex items-center gap-0.5 text-xs font-medium', good === null ? 'text-faint' : good ? 'text-sage' : 'text-rose')}>
      <Icon className="size-3.5" aria-hidden />
      {flat ? 'Flat' : `${Math.abs(pct).toFixed(pct > 99 ? 0 : 1)}%`}
      <span className="sr-only">{flat ? '' : pct > 0 ? ' increase' : ' decrease'} versus previous period</span>
    </span>
  );
}
