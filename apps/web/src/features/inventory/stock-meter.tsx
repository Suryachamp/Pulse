import { cn } from '@/lib/utils';

/** Available vs reserved vs threshold, at a glance. */
export function StockMeter({ onHand, reserved, threshold, className }: { onHand: number; reserved: number; threshold: number; className?: string }) {
  const available = onHand - reserved;
  const scale = Math.max(onHand, threshold * 3, 1);
  const tone = available <= 0 ? 'bg-rose' : available <= threshold ? 'bg-brass' : 'bg-sage';
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-raised', className)} aria-hidden>
      <div className={cn('absolute inset-y-0 left-0 rounded-full', tone)} style={{ width: `${(Math.max(available, 0) / scale) * 100}%` }} />
      <div className="absolute inset-y-0 rounded-full bg-slate/60" style={{ left: `${(Math.max(available, 0) / scale) * 100}%`, width: `${(reserved / scale) * 100}%` }} />
      <div className="absolute inset-y-[-2px] w-px bg-ink/40" style={{ left: `${Math.min(threshold / scale, 1) * 100}%` }} />
    </div>
  );
}

export function stockLabel(available: number, threshold: number) {
  if (available <= 0) return { text: 'Out of stock', tone: 'rose' as const };
  if (available <= threshold) return { text: 'Low', tone: 'brass' as const };
  return { text: 'In stock', tone: 'sage' as const };
}
