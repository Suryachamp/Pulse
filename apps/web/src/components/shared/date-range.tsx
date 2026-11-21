import { subDays, subMonths, startOfDay, endOfDay, format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList } from '@/components/ui/tabs';

export const PRESETS = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Last 12 months', custom: 'Custom' } as const;
export type Preset = keyof typeof PRESETS;

export function resolveRange(preset: Preset, from: string, to: string) {
  const now = new Date();
  if (preset === 'custom' && from && to) return { from: startOfDay(new Date(`${from}T00:00:00`)), to: endOfDay(new Date(`${to}T00:00:00`)) };
  const start = preset === '7d' ? subDays(now, 6) : preset === '90d' ? subDays(now, 89) : preset === '12m' ? subMonths(now, 12) : subDays(now, 29);
  return { from: startOfDay(start), to: now };
}

export function DateRangePicker({ preset, from, to, onChange }: { preset: Preset; from: string; to: string; onChange: (v: { preset: Preset; from: string; to: string }) => void }) {
  const range = resolveRange(preset, from, to);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="overflow-x-auto">
        <Tabs value={preset} onValueChange={(p) => onChange({ preset: p as Preset, from: format(range.from, 'yyyy-MM-dd'), to: format(range.to, 'yyyy-MM-dd') })}>
          <TabsList items={(Object.keys(PRESETS) as Preset[]).map((p) => ({ value: p, label: PRESETS[p] }))} />
        </Tabs>
      </div>
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="From" className="w-40" value={from} max={to} onChange={(e) => onChange({ preset, from: e.target.value, to })} />
          <span className="text-faint">to</span>
          <Input type="date" aria-label="To" className="w-40" value={to} min={from} max={format(new Date(), 'yyyy-MM-dd')} onChange={(e) => onChange({ preset, from, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
