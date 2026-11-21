import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertOctagon, AlertTriangle, Boxes, CheckCircle2, Circle, Info, Plus, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { ago, cn, money, number } from '@/lib/utils';
import type { Alert, Dashboard } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Avatar, ErrorState, Skeleton } from '@/components/ui/feedback';
import { RevenueChart } from '@/components/charts/revenue-chart';
import { Delta } from '@/components/charts/delta';

const ONBOARDING_KEY = 'pulse.onboarding.dismissed';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('panel flex flex-col', className)} aria-label={title}>
      <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="flex-1 px-5 pb-5">{children}</div>
    </section>
  );
}

function PulsePanel({ money: m }: { money: NonNullable<Dashboard['money']> }) {
  const { current, previous } = m.summary;
  const figures = [
    { label: 'Booked sales', value: money(current.bookedSalesCents), delta: <Delta current={current.bookedSalesCents} previous={previous.bookedSalesCents} /> },
    { label: 'Orders', value: number(current.orderCount), delta: <Delta current={current.orderCount} previous={previous.orderCount} /> },
    { label: 'Refunds', value: money(current.refundedCents), delta: <Delta current={current.refundedCents} previous={previous.refundedCents} inverse /> },
    { label: 'Outstanding now', value: money(m.summary.outstandingCents), delta: <span className="text-xs text-faint">{m.summary.ordersWithBalance} orders with a balance</span> },
  ];
  return (
    <section className="panel overflow-hidden" aria-label="Revenue, last 30 days">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(15rem,20rem)_1fr] lg:gap-10">
        <div className="flex flex-col">
          <p className="text-sm text-mist">Net revenue, last 30 days</p>
          <p className="tnum mt-2 font-display text-[3.4rem] leading-none tracking-[-0.02em]">{money(current.netRevenueCents)}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-faint">
            <Delta current={current.netRevenueCents} previous={previous.netRevenueCents} /> vs previous 30 days
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line/60 pt-5">
            {figures.map((f) => (
              <div key={f.label}>
                <dt className="text-xs text-faint">{f.label}</dt>
                <dd className="tnum mt-1 text-lg font-semibold">{f.value}</dd>
                <dd className="mt-0.5">{f.delta}</dd>
              </div>
            ))}
          </dl>
        </div>
        <RevenueChart points={m.series.points} unit={m.series.unit} height={290} />
      </div>
    </section>
  );
}

const ALERT_ICON = { critical: AlertOctagon, warning: AlertTriangle, info: Info } as const;
const ALERT_TONE = { critical: 'text-rose', warning: 'text-brass', info: 'text-slate' } as const;

function Alerts({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-line/60 bg-canvas/40 px-4 py-3 text-sm text-mist">
        <CheckCircle2 className="size-4 text-sage" aria-hidden /> Nothing needs your attention right now.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const Icon = ALERT_ICON[a.severity];
        return (
          <li key={a.id}>
            <Link to={a.href} className="flex gap-3 rounded-lg border border-line/60 bg-canvas/40 px-4 py-3 transition-colors hover:border-line hover:bg-raised/40">
              <Icon className={cn('mt-0.5 size-4 shrink-0', ALERT_TONE[a.severity])} aria-label={a.severity} />
              <span>
                <span className="block text-sm font-medium">{a.title}</span>
                <span className="block text-xs text-mist">{a.description}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Onboarding({ steps, onDismiss }: { steps: Dashboard['onboarding']; onDismiss: () => void }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="panel relative mb-6 overflow-hidden p-5" aria-label="Getting started">
      <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-brass/10 blur-3xl" aria-hidden />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-brass" aria-hidden />Set up your workspace</h2>
          <p className="mt-1 text-sm text-mist">{done} of {steps.length} done. Each step unlocks more of the dashboard.</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss setup checklist" onClick={onDismiss}><X /></Button>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-raised"><motion.div className="h-full bg-brass" initial={{ width: 0 }} animate={{ width: `${(done / steps.length) * 100}%` }} transition={{ duration: 0.6 }} /></div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s) => (
          <li key={s.id}>
            <Link to={s.href} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors', s.done ? 'border-line/40 text-faint line-through' : 'border-line bg-canvas/40 hover:border-brass/50')}>
              {s.done ? <CheckCircle2 className="size-4 shrink-0 text-sage" aria-hidden /> : <Circle className="size-4 shrink-0 text-faint" aria-hidden />}
              {s.label}
              <span className="sr-only">{s.done ? '(done)' : '(to do)'}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <Skeleton className="h-[22rem] w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { me, can } = useSession();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(ONBOARDING_KEY) === '1'; } catch { return false; }
  });
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard'), refetchInterval: 120_000 });
  const firstName = me?.user.name.split(' ')[0] ?? '';

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* not persisted */ }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.015em]">{greeting()}, {firstName}</h1>
          <p className="mt-1 text-sm text-mist">Here’s how {me?.organization?.name} is running today.</p>
        </div>
        {can('orders:write') && <Button asChild variant="primary"><Link to="/app/orders/new"><Plus />New order</Link></Button>}
      </div>

      {q.isLoading ? <DashboardSkeleton /> : q.isError ? <div className="panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></div> : q.data && (
        <>
          {!dismissed && q.data.onboarding.some((s) => !s.done) && <Onboarding steps={q.data.onboarding} onDismiss={dismiss} />}
          {q.data.money && <PulsePanel money={q.data.money} />}

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Needs attention">
              <Alerts alerts={q.data.alerts} />
            </Panel>

            <Panel title="Low stock" action={<Link to="/app/inventory?stock=low" className="text-xs text-mist hover:text-ink">View all {q.data.lowStockCount}</Link>}>
              {q.data.lowStock.length ? (
                <ul className="divide-y divide-line/40">
                  {q.data.lowStock.map((p) => (
                    <li key={p.id}>
                      <Link to={`/app/inventory/${p.id}`} className="flex items-center gap-3 py-2.5 hover:text-brass">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{p.name}</span>
                          <span className="block text-xs text-faint">{p.sku} · threshold {p.lowStockThreshold}</span>
                        </span>
                        <span className={cn('tnum text-sm font-semibold', p.available <= 0 ? 'text-rose' : 'text-brass')}>{p.available <= 0 ? 'Out' : `${p.available} left`}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 py-2 text-sm text-mist"><Boxes className="size-4 text-sage" aria-hidden />Every product is above its threshold.</p>
              )}
            </Panel>

            <Panel title="Tasks" action={<Link to="/app/tasks" className="text-xs text-mist hover:text-ink">Open board</Link>}>
              <TaskProgress tasks={q.data.tasks} />
            </Panel>

            <Panel title="Recent activity" className="lg:col-span-3" action={<Link to="/app/activity" className="text-xs text-mist hover:text-ink">Full history</Link>}>
              {q.data.activity.length ? (
                <ol className="grid gap-x-8 sm:grid-cols-2">
                  {q.data.activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 border-b border-line/40 py-2.5">
                      <Avatar name={a.actor?.name ?? 'System'} />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block truncate">{a.summary}</span>
                        <span className="block text-xs text-faint">{a.actor?.name ?? 'System'} · {ago(a.createdAt)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-mist">Activity appears here as your team works.</p>}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function TaskProgress({ tasks }: { tasks: Dashboard['tasks'] }) {
  const pct = tasks.total ? Math.round((tasks.done / tasks.total) * 100) : 0;
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-6">
      <div className="relative size-24 shrink-0">
        <svg viewBox="0 0 80 80" className="-rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="6" className="stroke-raised" />
          <motion.circle cx="40" cy="40" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-sage" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (pct / 100) * c }} transition={{ duration: 0.8, ease: 'easeOut' }} />
        </svg>
        <span className="tnum absolute inset-0 grid place-items-center text-lg font-semibold">{pct}%</span>
      </div>
      <dl className="grid flex-1 gap-2 text-sm">
        <div className="flex justify-between"><dt className="text-mist">Completed</dt><dd className="tnum">{tasks.done} of {tasks.total}</dd></div>
        <div className="flex justify-between"><dt className="text-mist">Open</dt><dd className="tnum">{tasks.open}</dd></div>
        <div className="flex justify-between"><dt className="text-mist">Due in 48h</dt><dd className="tnum">{tasks.dueSoon}</dd></div>
        <div className="flex justify-between">
          <dt className="text-mist">Overdue</dt>
          <dd className={cn('tnum', tasks.overdue && 'font-semibold text-rose')}>
            {tasks.overdue ? <Link to="/app/tasks?overdue=true" className="hover:underline">{tasks.overdue}</Link> : 0}
          </dd>
        </div>
      </dl>
      <span className="sr-only">{pct}% of tasks complete</span>
    </div>
  );
}
