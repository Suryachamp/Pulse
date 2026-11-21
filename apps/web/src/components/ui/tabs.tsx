import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList<V extends string>({ items, className }: { items: { value: V; label: string; count?: number }[]; className?: string }) {
  return (
    <T.List className={cn('inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-canvas/60 p-1', className)}>
      {items.map((i) => (
        <T.Trigger key={i.value} value={i.value} className="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[0.8125rem] text-mist transition-colors hover:text-ink data-[state=active]:bg-raised data-[state=active]:text-ink">
          {i.label}
          {i.count !== undefined && <span className="tnum text-2xs text-faint">{i.count}</span>}
        </T.Trigger>
      ))}
    </T.List>
  );
}
