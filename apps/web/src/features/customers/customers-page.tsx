import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useUrlState } from '@/hooks/use-url-state';
import { date, money } from '@/lib/utils';
import type { CustomerRow, Paginated } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { SortTh, Table, Td, Th, Tr } from '@/components/ui/table';
import { Tabs, TabsList } from '@/components/ui/tabs';
import { ExportButton } from '@/components/shared/export-button';
import { CustomerForm } from './customer-form';

type Sort = 'name' | 'createdAt' | 'totalSpent' | 'lastOrderAt';
const DEFAULTS = { q: '', status: 'active', tag: '', sort: 'createdAt', dir: 'desc', page: '1' };

export default function CustomersPage() {
  const { can } = useSession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [f, set] = useUrlState(DEFAULTS);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const list = useQuery({
    queryKey: ['customers', f],
    queryFn: () => api.get<Paginated<CustomerRow>>('/customers', { ...f, page: Number(f.page) }),
    placeholderData: keepPreviousData,
  });
  const tags = useQuery({ queryKey: ['customers', 'tags'], queryFn: () => api.get<{ data: string[] }>('/customers/tags') });
  const filtered = !!(f.q || f.tag || f.status !== 'active');

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Everyone you sell to, with their order history and balance."
        actions={<><ExportButton dataset="customers" />{can('customers:write') && <Button variant="primary" onClick={() => setCreating(true)}><Plus />New customer</Button>}</>}
      />
      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-line/60 p-4 lg:flex-row lg:items-center">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder="Search name, email, company or phone" />
          <Tabs value={f.status} onValueChange={(status) => set({ status })}>
            <TabsList items={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All' }]} />
          </Tabs>
          <Select
            aria-label="Filter by tag"
            className="lg:w-44"
            value={f.tag || '__all'}
            onValueChange={(tag) => set({ tag: tag === '__all' ? '' : tag })}
            options={[{ value: '__all', label: 'All tags' }, ...(tags.data?.data ?? []).map((t) => ({ value: t, label: t }))]}
          />
        </div>
        {list.isLoading ? <TableSkeleton /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.data.length ? (
          filtered ? (
            <EmptyState icon={Users} title="No customers match these filters" description="Try a different search or clear the filters." action={<Button onClick={() => set({ q: '', tag: '', status: 'active' })}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={Users} title="Add your first customer" description="Customers connect orders, payments and follow-up tasks in one history." action={can('customers:write') && <Button variant="primary" onClick={() => setCreating(true)}><Plus />New customer</Button>} />
          )
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <SortTh<Sort> label="Customer" field="name" sort={f.sort as Sort} dir={f.dir as 'asc' | 'desc'} onSort={(sort, dir) => set({ sort, dir })} />
                  <Th className="hidden md:table-cell">Tags</Th>
                  <Th className="text-right">Orders</Th>
                  <SortTh<Sort> label="Lifetime value" field="totalSpent" sort={f.sort as Sort} dir={f.dir as 'asc' | 'desc'} onSort={(sort, dir) => set({ sort, dir })} className="text-right" />
                  <Th className="hidden text-right sm:table-cell">Outstanding</Th>
                  <SortTh<Sort> label="Last order" field="lastOrderAt" sort={f.sort as Sort} dir={f.dir as 'asc' | 'desc'} onSort={(sort, dir) => set({ sort, dir })} className="hidden lg:table-cell" />
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((c) => (
                  <Tr key={c.id} onClick={() => navigate(`/app/customers/${c.id}`)}>
                    <Td>
                      <span className="block font-medium">{c.name}{c.archivedAt && <Badge tone="faint" className="ml-2">Archived</Badge>}</span>
                      <span className="block text-xs text-faint">{c.company ?? c.email ?? '—'}</span>
                    </Td>
                    <Td className="hidden md:table-cell"><span className="flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <Badge key={t} tone="faint">{t}</Badge>)}</span></Td>
                    <Td className="tnum text-right">{c.orderCount}</Td>
                    <Td className="tnum text-right">{money(c.totalSpentCents)}</Td>
                    <Td className={`tnum hidden text-right sm:table-cell ${c.outstandingCents ? 'text-brass' : 'text-faint'}`}>{money(c.outstandingCents)}</Td>
                    <Td className="hidden text-mist lg:table-cell">{c.lastOrderAt ? date(c.lastOrderAt) : 'Never'}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} noun="customers" onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
      <CustomerForm open={creating} onOpenChange={setCreating} onSaved={(id) => navigate(`/app/customers/${id}`)} />
    </div>
  );
}
