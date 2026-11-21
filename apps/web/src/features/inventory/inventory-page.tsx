import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useUrlState } from '@/hooks/use-url-state';
import { money } from '@/lib/utils';
import type { Paginated, Product } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { SearchInput } from '@/components/ui/search-input';
import { SortTh, Table, Td, Th, Tr } from '@/components/ui/table';
import { Tabs, TabsList } from '@/components/ui/tabs';
import { ProductForm } from './product-form';
import { StockMeter, stockLabel } from './stock-meter';

type Sort = 'name' | 'sku' | 'available' | 'priceCents' | 'createdAt';
const DEFAULTS = { q: '', stock: 'all', status: 'active', sort: 'name', dir: 'asc', page: '1' };

export default function InventoryPage() {
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

  const list = useQuery({ queryKey: ['products', f], queryFn: () => api.get<Paginated<Product>>('/products', { ...f, page: Number(f.page) }), placeholderData: keepPreviousData });
  const sortProps = { sort: f.sort as Sort, dir: f.dir as 'asc' | 'desc', onSort: (sort: Sort, dir: 'asc' | 'desc') => set({ sort, dir }) };

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Available stock is on hand minus what confirmed orders have reserved."
        actions={can('products:write') && <Button variant="primary" onClick={() => setCreating(true)}><Plus />New product</Button>}
      />
      <div className="panel">
        <div className="flex flex-col gap-3 border-b border-line/60 p-4 lg:flex-row lg:items-center">
          <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder="Search by name or SKU" />
          <Tabs value={f.stock} onValueChange={(stock) => set({ stock })}>
            <TabsList items={[{ value: 'all', label: 'All stock' }, { value: 'low', label: 'Low' }, { value: 'out', label: 'Out' }]} />
          </Tabs>
          <Tabs value={f.status} onValueChange={(status) => set({ status })}>
            <TabsList items={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
          </Tabs>
        </div>
        {list.isLoading ? <TableSkeleton /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : !list.data?.data.length ? (
          f.q || f.stock !== 'all' || f.status !== 'active' ? (
            <EmptyState icon={Boxes} title={f.stock === 'all' ? 'No products match' : 'Nothing is running low'} description={f.stock === 'all' ? 'Try another search term or filter.' : 'Every product is above its low-stock threshold.'} action={<Button onClick={() => set({ q: '', stock: 'all', status: 'active' })}>Clear filters</Button>} />
          ) : (
            <EmptyState icon={Boxes} title="Add your first product" description="Products need a SKU, a price and opening stock. Orders reserve from this stock." action={can('products:write') && <Button variant="primary" onClick={() => setCreating(true)}><Plus />New product</Button>} />
          )
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <SortTh<Sort> label="Product" field="name" {...sortProps} />
                  <SortTh<Sort> label="Price" field="priceCents" {...sortProps} className="hidden text-right sm:table-cell" />
                  <Th className="hidden text-right md:table-cell">On hand</Th>
                  <Th className="hidden text-right md:table-cell">Reserved</Th>
                  <SortTh<Sort> label="Available" field="available" {...sortProps} className="text-right" />
                  <Th className="hidden w-48 lg:table-cell">Level</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((p) => {
                  const label = stockLabel(p.available, p.lowStockThreshold);
                  return (
                    <Tr key={p.id} onClick={() => navigate(`/app/inventory/${p.id}`)}>
                      <Td>
                        <span className="block font-medium">{p.name}{p.archivedAt && <Badge tone="faint" className="ml-2">Archived</Badge>}</span>
                        <span className="block text-xs text-faint">{p.sku}</span>
                      </Td>
                      <Td className="tnum hidden text-right sm:table-cell">{money(p.priceCents)}</Td>
                      <Td className="tnum hidden text-right md:table-cell">{p.onHand}</Td>
                      <Td className="tnum hidden text-right text-mist md:table-cell">{p.reserved}</Td>
                      <Td className="text-right"><span className="tnum mr-2 font-semibold">{p.available}</span><Badge tone={label.tone}>{label.text}</Badge></Td>
                      <Td className="hidden lg:table-cell"><StockMeter onHand={p.onHand} reserved={p.reserved} threshold={p.lowStockThreshold} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} noun="products" onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </div>
      <ProductForm open={creating} onOpenChange={setCreating} onSaved={(id) => navigate(`/app/inventory/${id}`)} />
    </div>
  );
}
