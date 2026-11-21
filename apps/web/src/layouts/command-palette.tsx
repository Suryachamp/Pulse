import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Command } from 'cmdk';
import * as D from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Boxes, LogOut, Plus, Search, ShoppingBag, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useDebounced } from '@/hooks/use-debounced';
import { money } from '@/lib/utils';
import { Kbd } from '@/components/ui/feedback';
import type { CustomerRow, OrderRow, Paginated, Product } from '@/types/api';
import { NAV_SECTIONS } from './nav';

const PaletteContext = createContext<{ open: () => void } | null>(null);
export const usePalette = () => {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error('usePalette outside provider');
  return ctx;
};

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function CommandPaletteProvider({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const { can } = useSession();
  const debounced = useDebounced(q.trim(), 200);
  const pendingG = useRef<number | null>(null);

  const go = useCallback((to: string) => {
    setOpen(false);
    setQ('');
    navigate(to);
  }, [navigate]);

  // ⌘K / Ctrl+K opens the palette; "G then letter" jumps between sections.
  useEffect(() => {
    const shortcuts = new Map(NAV_SECTIONS.flatMap((s) => s.items).filter((i) => i.shortcut && (!i.permission || can(i.permission))).map((i) => [i.shortcut!.split(' ')[1]!.toLowerCase(), i.to]));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (pendingG.current !== null) {
        const to = shortcuts.get(e.key.toLowerCase());
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        if (to) { e.preventDefault(); navigate(to); }
        return;
      }
      if (e.key === 'g') pendingG.current = window.setTimeout(() => { pendingG.current = null; }, 900);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [can, navigate]);

  const enabled = open && debounced.length >= 2;
  const customers = useQuery({ queryKey: ['palette', 'customers', debounced], queryFn: () => api.get<Paginated<CustomerRow>>('/customers', { q: debounced, pageSize: 5 }), enabled });
  const products = useQuery({ queryKey: ['palette', 'products', debounced], queryFn: () => api.get<Paginated<Product>>('/products', { q: debounced, pageSize: 5 }), enabled });
  const orders = useQuery({ queryKey: ['palette', 'orders', debounced], queryFn: () => api.get<Paginated<OrderRow>>('/orders', { q: debounced, pageSize: 5 }), enabled });

  const item = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink aria-selected:bg-raised [&_svg]:size-4 [&_svg]:text-faint';
  const group = 'px-1 py-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint';

  return (
    <PaletteContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <D.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
          <D.Content className="glass fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line shadow-lift focus:outline-none">
            <D.Title className="sr-only">Command palette</D.Title>
            <D.Description className="sr-only">Search records or jump to a page</D.Description>
            <Command shouldFilter={!enabled} loop>
              <div className="flex items-center gap-3 border-b border-line/70 px-4">
                <Search className="size-4 text-faint" aria-hidden />
                <Command.Input value={q} onValueChange={setQ} placeholder="Search customers, orders, products, or jump to…" className="h-14 flex-1 bg-transparent text-[0.9375rem] text-ink placeholder:text-faint focus:outline-none" />
                <Kbd>Esc</Kbd>
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
                <Command.Empty className="px-4 py-10 text-center text-sm text-mist">
                  {enabled && (customers.isFetching || products.isFetching || orders.isFetching) ? 'Searching…' : 'No matches. Try a name, SKU or order number.'}
                </Command.Empty>
                {enabled ? (
                  <>
                    {!!orders.data?.data.length && (
                      <Command.Group heading="Orders" className={group}>
                        {orders.data.data.map((o) => (
                          <Command.Item key={o.id} value={`order-${o.id}`} onSelect={() => go(`/app/orders/${o.id}`)} className={item}>
                            <ShoppingBag /> <span className="tnum">#{o.number}</span> <span className="text-mist">{o.customer.name}</span>
                            <span className="tnum ml-auto text-xs text-faint">{money(o.totalCents)}</span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {!!customers.data?.data.length && (
                      <Command.Group heading="Customers" className={group}>
                        {customers.data.data.map((c) => (
                          <Command.Item key={c.id} value={`customer-${c.id}`} onSelect={() => go(`/app/customers/${c.id}`)} className={item}>
                            <User /> {c.name} {c.company && <span className="text-mist">{c.company}</span>}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                    {!!products.data?.data.length && (
                      <Command.Group heading="Products" className={group}>
                        {products.data.data.map((p) => (
                          <Command.Item key={p.id} value={`product-${p.id}`} onSelect={() => go(`/app/inventory/${p.id}`)} className={item}>
                            <Boxes /> {p.name} <span className="text-mist">{p.sku}</span>
                            <span className="tnum ml-auto text-xs text-faint">{p.available} available</span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                  </>
                ) : (
                  <>
                    <Command.Group heading="Create" className={group}>
                      {can('orders:write') && <Command.Item onSelect={() => go('/app/orders/new')} className={item}><Plus />New order</Command.Item>}
                      {can('customers:write') && <Command.Item onSelect={() => go('/app/customers?new=1')} className={item}><Plus />New customer</Command.Item>}
                      {can('products:write') && <Command.Item onSelect={() => go('/app/inventory?new=1')} className={item}><Plus />New product</Command.Item>}
                      {can('tasks:write') && <Command.Item onSelect={() => go('/app/tasks?new=1')} className={item}><Plus />New task</Command.Item>}
                    </Command.Group>
                    <Command.Group heading="Go to" className={group}>
                      {NAV_SECTIONS.flatMap((s) => s.items).filter((i) => !i.permission || can(i.permission)).map((i) => (
                        <Command.Item key={i.to} onSelect={() => go(i.to)} className={item}>
                          <i.icon /> {i.label}
                          {i.shortcut && <span className="ml-auto flex gap-1">{i.shortcut.split(' ').map((k) => <Kbd key={k}>{k}</Kbd>)}</span>}
                        </Command.Item>
                      ))}
                    </Command.Group>
                    <Command.Group heading="Account" className={group}>
                      <Command.Item onSelect={() => { setOpen(false); onSignOut(); }} className={item}><LogOut />Sign out</Command.Item>
                    </Command.Group>
                  </>
                )}
              </Command.List>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </PaletteContext.Provider>
  );
}
