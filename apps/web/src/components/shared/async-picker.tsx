import { useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown, Search } from 'lucide-react';
import { useDebounced } from '@/hooks/use-debounced';
import { cn } from '@/lib/utils';

interface AsyncPickerProps<T> {
  id?: string;
  queryKey: string;
  fetch: (q: string) => Promise<T[]>;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  trigger: ReactNode;
  placeholder: string;
  isDisabled?: (item: T) => boolean;
  invalid?: boolean;
  className?: string;
}

/** Server-searched combobox: results come from the API, never a client-side copy of the table. */
export function AsyncPicker<T>({ id, queryKey, fetch, getKey, renderItem, onSelect, trigger, placeholder, isDisabled, invalid, className }: AsyncPickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const debounced = useDebounced(q.trim(), 200);
  const results = useQuery({ queryKey: ['picker', queryKey, debounced], queryFn: () => fetch(debounced), enabled: open });

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <Popover.Trigger asChild>
        <button id={id} type="button" aria-invalid={invalid || undefined} className={cn('flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-line bg-canvas/60 px-3 text-left text-sm hover:border-faint focus:outline-none focus:ring-2 focus:ring-brass/20 aria-[invalid=true]:border-rose/70', className)}>
          <span className="min-w-0 flex-1 truncate">{trigger}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-faint" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="glass z-50 w-[var(--radix-popover-trigger-width)] min-w-72 overflow-hidden rounded-xl border border-line shadow-lift">
          <Command shouldFilter={false}>
            <div className="flex items-center gap-2 border-b border-line/70 px-3">
              <Search className="size-4 text-faint" aria-hidden />
              <Command.Input autoFocus value={q} onValueChange={setQ} placeholder={placeholder} className="h-10 flex-1 bg-transparent text-sm placeholder:text-faint focus:outline-none" />
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-1">
              {results.isLoading ? <div className="px-3 py-6 text-center text-sm text-mist">Searching…</div> : (
                <>
                  <Command.Empty className="px-3 py-6 text-center text-sm text-mist">No matches</Command.Empty>
                  {results.data?.map((item) => (
                    <Command.Item
                      key={getKey(item)}
                      value={getKey(item)}
                      disabled={isDisabled?.(item)}
                      onSelect={() => { onSelect(item); setOpen(false); }}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm aria-selected:bg-raised data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40"
                    >
                      {renderItem(item)}
                    </Command.Item>
                  ))}
                </>
              )}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
