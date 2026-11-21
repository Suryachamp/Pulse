import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, ShoppingBag } from 'lucide-react';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '@pulse/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useUrlState } from '@/hooks/use-url-state';
import { date, money, sentence } from '@/lib/utils';
import type { OrderRow, Paginated } from '@/types/api';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, OrderStatusBadge, PageHeader, Pagination, PaymentStatusBadge, TableSkeleton } from '@/components/ui/feedback';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { SortTh, Table, Td, Th, Tr } from '@/components/ui/table';
import { Tabs, TabsList } from '@/components/ui/tabs';

type Sort = 'number' | 'createdAt' | 'totalCents';
const DEFAULTS = { q: '', status: '', paymentStatus: '', sort: 'createdAt', dir: 'desc', page: '1' };

export default function OrdersPage() {
  const { can } = useSession();
  const navigate = useNavigate();
  const [f, set] = useUrlState(DEFAULTS);
  const list = useQuery({ queryKey: ['orders', f], queryFn: () => api.get<Paginated<OrderRow>>('/orders', { ...f, page: Number(f.page) }), placeholderData: keepPreviousData });
  const sortProps = { sort: f.sort as Sort, dir: f.dir as 'asc' | 'desc', onSort: (sort: Sort, dir: 'asc' | 'desc') => set({ sort, dir }) };
  const filtered = !!(f.q || f.status || f.paymentStatus);

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Draft, confirm, fulfil and complete. Stock is reserved when an order is confirmed."
        actions={can('orders:write') && <Button asChild variant="primary"><Link to="/app/orders/new"><Plus />New order</Link></Button>}
      />
      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-line/60 p-4 xl:flex-row xl:items-center">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder="Search order # or customer" />
          <div className="overflow-x-auto">
            <Tabs value={f.status || 'ALL'} onValueChange={(v) => set({ status: v === 'ALL' ? '' : v })}>
              <TabsList items={[{ value: 'ALL', label: 'All' }, ...ORDER_STATUSES.map((s) => ({ value: s, label: sentence(s) }))]} />
            </Tabs>
          </div>
          <Select
            aria-label="Filter by payment status"
            className="xl:ml-auto xl:w-48"
            value={f.paymentStatus || 'ANY'}
            onValueChange={(v) => set({ paymentStatus: v === 'ANY' ? '' : v })}
            options={[{ value: 'ANY', label: 'Any payment status' }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: sentence(s) }))]}
          />
        </div>
        {list.isLoading ? <TableSkeleton /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.data.length ? (
          filtered ? (
            <EmptyState icon={ShoppingBag} title="No orders match these filters" description="Try another status or search." action={<Button onClick={() => set({ q: '', status: '', paymentStatus: '' })}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={ShoppingBag} title="Create your first order" description="Pick a customer and products. Totals are calculated for you from catalog prices." action={can('orders:write') && <Button asChild variant="primary"><Link to="/app/orders/new"><Plus />New order</Link></Button>} />
          )
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <SortTh<Sort> label="Order" field="number" {...sortProps} />
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th className="hidden md:table-cell">Payment</Th>
                  <SortTh<Sort> label="Total" field="totalCents" {...sortProps} className="text-right" />
                  <Th className="hidden text-right lg:table-cell">Balance</Th>
                  <SortTh<Sort> label="Placed" field="createdAt" {...sortProps} className="hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((o) => (
                  <Tr key={o.id} onClick={() => navigate(`/app/orders/${o.id}`)}>
                    <Td className="tnum font-medium">#{o.number}<span className="block text-xs font-normal text-faint">{o._count.items} {o._count.items === 1 ? 'item' : 'items'}</span></Td>
                    <Td><span className="block max-w-[14rem] truncate">{o.customer.name}</span><span className="block max-w-[14rem] truncate text-xs text-faint">{o.customer.company}</span></Td>
                    <Td><OrderStatusBadge status={o.status} /></Td>
                    <Td className="hidden md:table-cell"><PaymentStatusBadge status={o.paymentStatus} /></Td>
                    <Td className="tnum text-right">{money(o.totalCents)}</Td>
                    <Td className={`tnum hidden text-right lg:table-cell ${o.outstandingCents ? 'text-brass' : 'text-faint'}`}>{money(o.outstandingCents)}</Td>
                    <Td className="hidden text-mist sm:table-cell">{date(o.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} noun="orders" onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
    </div>
  );
}
