import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, ListChecks, MoreHorizontal, Plus } from 'lucide-react';
import { TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from '@pulse/shared';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useUrlState } from '@/hooks/use-url-state';
import { cn, shortDate, sentence } from '@/lib/utils';
import type { Paginated, Task } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, ErrorState, PageHeader, PriorityBadge, Skeleton, TaskStatusBadge } from '@/components/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/menu';
import { SearchInput } from '@/components/ui/search-input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Tabs, TabsList } from '@/components/ui/tabs';
import { TaskForm, useMembers } from './task-form';

const DEFAULTS = { view: 'board', q: '', assigneeId: '', priority: '', overdue: '' };
const COLUMN_HINT: Record<TaskStatus, string> = { TODO: 'Not started', IN_PROGRESS: 'Being worked on', BLOCKED: 'Waiting on something', DONE: 'Finished' };

function DueLabel({ task }: { task: Task }) {
  if (!task.dueAt) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', task.isOverdue ? 'font-medium text-rose' : 'text-faint')}>
      <CalendarClock className="size-3.5" aria-hidden />
      {task.isOverdue ? 'Overdue · ' : ''}{shortDate(task.dueAt)}
    </span>
  );
}

export default function TasksPage() {
  const { can } = useSession();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [f, set] = useUrlState(DEFAULTS);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const members = useMembers();

  const key = ['tasks', { q: f.q, assigneeId: f.assigneeId, priority: f.priority, overdue: f.overdue }];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api.get<Paginated<Task>>('/tasks', { q: f.q, assigneeId: f.assigneeId, priority: f.priority, overdue: f.overdue || undefined, pageSize: 200 }),
  });

  useEffect(() => {
    const id = params.get('task');
    if (params.get('new') === '1') { setCreating(true); params.delete('new'); setParams(params, { replace: true }); }
    if (id && list.data) {
      const t = list.data.data.find((x) => x.id === id);
      if (t) setEditing(t);
      params.delete('task');
      setParams(params, { replace: true });
    }
  }, [params, setParams, list.data]);

  const move = useMutation({
    mutationFn: ({ task, status, position }: { task: Task; status: TaskStatus; position: number }) => api.patch<Task>(`/tasks/${task.id}`, { status, position }),
    // Optimistic: the card moves immediately and snaps back if the server refuses.
    onMutate: async ({ task, status, position }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Paginated<Task>>(key);
      qc.setQueryData<Paginated<Task>>(key, (old) => old && { ...old, data: old.data.map((t) => (t.id === task.id ? { ...t, status, position, isOverdue: status !== 'DONE' && !!t.dueAt && new Date(t.dueAt) < new Date() } : t)) });
      return { prev };
    },
    onError: (err, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); toast.error(errorMessage(err)); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });

  const columns = useMemo(() => {
    const by: Record<TaskStatus, Task[]> = { TODO: [], IN_PROGRESS: [], BLOCKED: [], DONE: [] };
    for (const t of list.data?.data ?? []) by[t.status].push(t);
    for (const s of TASK_STATUSES) by[s].sort((a, b) => a.position - b.position);
    return by;
  }, [list.data]);

  const moveTo = (task: Task, status: TaskStatus) => {
    const col = columns[status].filter((t) => t.id !== task.id);
    const position = (col.at(-1)?.position ?? 0) + 1024;
    if (task.status !== status) move.mutate({ task, status, position });
  };

  const onDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOver(null);
    const task = list.data?.data.find((t) => t.id === e.dataTransfer.getData('text/task'));
    if (task) moveTo(task, status);
  };

  const memberOptions = [{ value: 'ALL', label: 'Everyone' }, { value: 'me', label: 'Assigned to me' }, { value: 'unassigned', label: 'Unassigned' }, ...(members.data?.data ?? []).map((m) => ({ value: m.user.id, label: m.user.name }))];

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Follow-ups, restocks and everything else your team needs to get done."
        actions={can('tasks:write') && <Button variant="primary" onClick={() => setCreating(true)}><Plus />New task</Button>}
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={f.q} onChange={(q) => set({ q })} placeholder="Search tasks" />
        <Select aria-label="Filter by assignee" className="lg:w-48" value={f.assigneeId || 'ALL'} onValueChange={(v) => set({ assigneeId: v === 'ALL' ? '' : v })} options={memberOptions} />
        <Select aria-label="Filter by priority" className="lg:w-40" value={f.priority || 'ALL'} onValueChange={(v) => set({ priority: v === 'ALL' ? '' : v })} options={[{ value: 'ALL', label: 'Any priority' }, ...TASK_PRIORITIES.map((p) => ({ value: p, label: sentence(p) }))]} />
        <Button variant={f.overdue ? 'primary' : 'secondary'} size="sm" aria-pressed={!!f.overdue} onClick={() => set({ overdue: f.overdue ? '' : 'true' })}><CalendarClock />Overdue only</Button>
        <Tabs value={f.view} onValueChange={(view) => set({ view })} className="lg:ml-auto">
          <TabsList items={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }]} />
        </Tabs>
      </div>

      {list.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{TASK_STATUSES.map((s) => <Skeleton key={s} className="h-80 rounded-xl" />)}</div>
      ) : list.isError ? <div className="panel"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div> : !list.data?.data.length ? (
        <div className="panel"><EmptyState icon={ListChecks} title={f.q || f.assigneeId || f.priority || f.overdue ? 'No tasks match' : 'No tasks yet'} description={f.overdue ? 'Nothing is overdue. Nice work.' : 'Create a task for follow-ups, restocks or anything your team needs to remember.'} action={can('tasks:write') && <Button variant="primary" onClick={() => setCreating(true)}><Plus />New task</Button>} /></div>
      ) : f.view === 'board' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TASK_STATUSES.map((status) => (
            <section
              key={status}
              aria-label={`${sentence(status)} column`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => onDrop(e, status)}
              className={cn('panel flex min-h-[18rem] flex-col p-3 transition-shadow', dragOver === status && 'shadow-glow')}
            >
              <header className="mb-3 flex items-center justify-between px-1">
                <div><TaskStatusBadge status={status} /><p className="mt-1 text-2xs text-faint">{COLUMN_HINT[status]}</p></div>
                <span className="tnum text-xs text-faint">{columns[status].length}</span>
              </header>
              <ul className="flex flex-1 flex-col gap-2">
                {columns[status].map((t) => (
                  <li
                    key={t.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/task', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                    className="group cursor-grab rounded-lg border border-line/70 bg-canvas/50 p-3 transition-colors hover:border-line hover:bg-raised/40 active:cursor-grabbing"
                  >
                    <div className="flex items-start gap-2">
                      <button type="button" className="min-w-0 flex-1 text-left text-sm font-medium hover:text-brass" onClick={() => setEditing(t)}>{t.title}</button>
                      <Menu>
                        <MenuTrigger asChild><Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1 size-7 opacity-60 group-hover:opacity-100" aria-label={`Move ${t.title}`}><MoreHorizontal /></Button></MenuTrigger>
                        <MenuContent>
                          <MenuLabel>Move to</MenuLabel>
                          {TASK_STATUSES.filter((s) => s !== t.status).map((s) => <MenuItem key={s} onSelect={() => moveTo(t, s)}>{sentence(s)}</MenuItem>)}
                        </MenuContent>
                      </Menu>
                    </div>
                    {t.customer && <p className="mt-1 truncate text-xs text-faint">{t.customer.name}</p>}
                    <div className="mt-3 flex items-center gap-2">
                      <PriorityBadge priority={t.priority} />
                      <DueLabel task={t} />
                      {t.assignee && <span className="ml-auto" title={t.assignee.name}><Avatar name={t.assignee.name} className="size-6" /></span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Table>
            <thead><tr><Th>Task</Th><Th>Status</Th><Th className="hidden sm:table-cell">Priority</Th><Th className="hidden md:table-cell">Due</Th><Th className="hidden lg:table-cell">Assignee</Th></tr></thead>
            <tbody>
              {list.data.data.map((t) => (
                <Tr key={t.id} onClick={() => setEditing(t)}>
                  <Td><span className="font-medium">{t.title}</span>{t.customer && <span className="block text-xs text-faint">{t.customer.name}</span>}</Td>
                  <Td><TaskStatusBadge status={t.status} /></Td>
                  <Td className="hidden sm:table-cell"><PriorityBadge priority={t.priority} /></Td>
                  <Td className="hidden md:table-cell">{t.dueAt ? <DueLabel task={t} /> : <span className="text-faint">—</span>}</Td>
                  <Td className="hidden text-mist lg:table-cell">{t.assignee?.name ?? 'Unassigned'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <TaskForm open={creating} onOpenChange={setCreating} />
      <TaskForm open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} task={editing ?? undefined} />
    </div>
  );
}
