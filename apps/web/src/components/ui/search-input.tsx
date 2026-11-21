import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useDebounced } from '@/hooks/use-debounced';
import { cn } from '@/lib/utils';

/** Debounced search box that reports changes to its parent (usually URL state). */
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebounced(draft, 250);
  useEffect(() => { if (debounced !== value) onChange(debounced); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <div className={cn('relative w-full sm:max-w-xs', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-line bg-canvas/60 pl-9 pr-8 text-sm text-ink placeholder:text-faint hover:border-faint focus:border-brass/70 focus:outline-none focus:ring-2 focus:ring-brass/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button type="button" aria-label="Clear search" onClick={() => setDraft('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
