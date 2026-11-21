import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Table = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className="overflow-x-auto">
    <table className={cn('w-full border-collapse text-sm', className)}>{children}</table>
  </div>
);

export const Th = ({ className, ...p }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('h-10 whitespace-nowrap border-b border-line/70 px-5 text-left text-xs font-medium text-faint', className)} {...p} />
);

export const Td = ({ className, ...p }: TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('h-14 border-b border-line/40 px-5', className)} {...p} />;

export function Tr({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn('transition-colors', onClick && 'cursor-pointer hover:bg-raised/40 focus-visible:bg-raised/40 focus-visible:outline-none', className)}
    >
      {children}
    </tr>
  );
}

export function SortTh<K extends string>({ label, field, sort, dir, onSort, className }: { label: string; field: K; sort: K; dir: 'asc' | 'desc'; onSort: (f: K, d: 'asc' | 'desc') => void; className?: string }) {
  const active = sort === field;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Th className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={cn('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')} onClick={() => onSort(field, active && dir === 'desc' ? 'asc' : 'desc')}>
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </Th>
  );
}
