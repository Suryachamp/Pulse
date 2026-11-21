import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import type { OrderStatus, PaymentStatus, TaskPriority, TaskStatus } from '@pulse/shared';
import { cn, initials, sentence } from '@/lib/utils';
import { errorMessage as errorMessageOf } from '@/lib/api';
import { Button } from './button';

type Tone = 'neutral' | 'brass' | 'sage' | 'slate' | 'rose' | 'faint';
const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-ink border-line',
  brass: 'bg-brass/10 text-brass border-brass/25',
  sage: 'bg-sage/10 text-sage border-sage/25',
  slate: 'bg-slate/10 text-slate border-slate/25',
  rose: 'bg-rose/10 text-rose border-rose/25',
  faint: 'bg-transparent text-faint border-line',
};

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium', TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const ORDER_TONE: Record<OrderStatus, Tone> = { DRAFT: 'faint', CONFIRMED: 'slate', FULFILLED: 'brass', COMPLETED: 'sage', CANCELLED: 'rose' };
const PAY_TONE: Record<PaymentStatus, Tone> = { UNPAID: 'faint', PARTIALLY_PAID: 'brass', PAID: 'sage', PARTIALLY_REFUNDED: 'slate', REFUNDED: 'rose' };
const TASK_TONE: Record<TaskStatus, Tone> = { TODO: 'faint', IN_PROGRESS: 'slate', BLOCKED: 'rose', DONE: 'sage' };
const PRIORITY_TONE: Record<TaskPriority, Tone> = { LOW: 'faint', MEDIUM: 'neutral', HIGH: 'brass', URGENT: 'rose' };

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={ORDER_TONE[status]} dot>{sentence(status)}</Badge>;
export const PaymentStatusBadge = ({ status }: { status: PaymentStatus }) => <Badge tone={PAY_TONE[status]}>{sentence(status)}</Badge>;
export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => <Badge tone={TASK_TONE[status]} dot>{sentence(status)}</Badge>;
export const PriorityBadge = ({ priority }: { priority: TaskPriority }) => <Badge tone={PRIORITY_TONE[priority]}>{sentence(priority)}</Badge>;

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-raised/60', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line/50" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-5 py-4">
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-40' : 'w-20 flex-1')} />)}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-raised/50">
        <Icon className="size-5 text-brass" aria-hidden />
      </div>
      <h3 className="text-[0.9375rem] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-mist">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'This didn’t load' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" role="alert">
      <AlertTriangle className="mb-3 size-6 text-rose" aria-hidden />
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-mist">{errorMessageOf(error)}</p>
      {onRetry && <Button className="mt-4" size="sm" onClick={onRetry}><RotateCw />Try again</Button>}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage, noun = 'results' }: { page: number; totalPages: number; total: number; onPage: (p: number) => void; noun?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line/60 px-5 py-3 text-sm text-mist">
      <span className="tnum">{total.toLocaleString()} {noun}</span>
      <div className="flex items-center gap-2">
        <span className="tnum hidden sm:inline">Page {page} of {totalPages}</span>
        <Button size="icon-sm" variant="ghost" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
        <Button size="icon-sm" variant="ghost" aria-label="Next page" disabled={page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.015em]">{title}</h1>
        {description && <p className="mt-1 text-sm text-mist">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-full border border-line bg-raised text-2xs font-semibold text-mist', className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-canvas px-1 font-sans text-2xs text-faint">{children}</kbd>
);
