import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, ChevronDown, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useUrlState } from '@/hooks/use-url-state';
import { cn, dateTime } from '@/lib/utils';
import type { ActivityEntry, Paginated } from '@/types/api';
import { Avatar, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';

const DEFAULTS = { q: '', entityType: '', page: '1' };
const ENTITY_LINK: Record<string, (id: string) => string | null> = {
  Order: (id) => `/app/orders/${id}`,
  Customer: (id) => `/app/customers/${id}`,
  Product: (id) => `/app/inventory/${id}`,
  Task: (id) => `/app/tasks?task=${id}`,
};

export default function ActivityPage() {
  const { can } = useSession();
  const full = can('audit:read');
  const [f, set] = useUrlState(DEFAULTS);
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['activity', full, f],
    queryFn: () => api.get<Paginated<ActivityEntry>>(full ? '/audit-logs' : '/activity', { ...f, page: Number(f.page), pageSize: 30 }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title={full ? 'Audit log' : 'Activity'}
        description={full ? 'An append-only record of every important change: who did it, what changed, and when. Entries can’t be edited or deleted.' : 'What your team has been doing.'}
      />
      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-line/60 p-4 sm:flex-row sm:items-center">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder="Search activity" />
          <Select aria-label="Filter by record type" className="sm:w-48" value={f.entityType || 'ALL'} onValueChange={(v) => set({ entityType: v === 'ALL' ? '' : v })} options={[{ value: 'ALL', label: 'All records' }, ...['Order', 'Customer', 'Product', 'Task', 'Membership', 'Organization'].map((t) => ({ value: t, label: t === 'Membership' ? 'Team' : t }))]} />
          {full && <span className="flex items-center gap-1.5 text-xs text-faint sm:ml-auto"><ShieldCheck className="size-4 text-sage" aria-hidden />Tamper-protected</span>}
        </div>
        {list.isLoading ? <TableSkeleton cols={3} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.data.length ? (
          <EmptyState icon={Activity} title="No activity found" description="Changes to orders, stock, customers and tasks are recorded here automatically." />
        ) : (
          <>
            <ol>
              {list.data.data.map((e) => {
                const href = ENTITY_LINK[e.entityType]?.(e.entityId) ?? null;
                const expanded = open === e.id;
                return (
                  <li key={e.id} className="border-b border-line/40">
                    <div className="flex items-start gap-3 px-5 py-3.5">
                      <Avatar name={e.actor?.name ?? 'System'} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{href ? <Link to={href} className="hover:text-brass">{e.summary}</Link> : e.summary}</p>
                        <p className="text-xs text-faint">{e.actor?.name ?? 'System'} · {dateTime(e.createdAt)} · <code className="text-faint">{e.action}</code></p>
                      </div>
                      {full && (
                        <button type="button" className="rounded p-1 text-faint hover:text-ink" aria-expanded={expanded} aria-label="Show details" onClick={() => setOpen(expanded ? null : e.id)}>
                          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
                        </button>
                      )}
                    </div>
                    {full && expanded && (
                      <div className="mx-5 mb-4 rounded-lg border border-line/60 bg-canvas/60 p-3 text-xs">
                        <p className="mb-2 text-faint">{e.entityType} {e.entityId}{e.ip && ` · from ${e.ip}`}</p>
                        <pre className="overflow-x-auto whitespace-pre-wrap text-mist">{JSON.stringify(e.metadata ?? {}, null, 2)}</pre>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} noun="entries" onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
