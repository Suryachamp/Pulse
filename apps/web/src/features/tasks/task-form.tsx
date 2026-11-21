import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { TASK_PRIORITIES, TASK_STATUSES } from '@pulse/shared';
import { api, errorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useSession } from '@/lib/session';
import { sentence } from '@/lib/utils';
import type { CustomerRow, Member, Paginated, Task } from '@/types/api';
import { ConfirmDialog, Sheet } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AsyncPicker } from '@/components/shared/async-picker';

const formSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().max(5000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: z.string(),
  assigneeId: z.string(),
  customerId: z.string(),
});
type FormValues = z.infer<typeof formSchema>;
const NONE = '__none';

export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: () => api.get<{ data: Member[] }>('/members'), staleTime: 5 * 60_000 });
}

export function TaskForm({ open, onOpenChange, task }: { open: boolean; onOpenChange: (o: boolean) => void; task?: Task }) {
  const qc = useQueryClient();
  const { me, can } = useSession();
  const members = useMembers();
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { register, handleSubmit, control, reset, setError, setValue, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (!open) return;
    setCustomerName(task?.customer?.name ?? null);
    reset({
      title: task?.title ?? '', description: task?.description ?? '', status: task?.status ?? 'TODO', priority: task?.priority ?? 'MEDIUM',
      dueAt: task?.dueAt ? task.dueAt.slice(0, 10) : '', assigneeId: task?.assignee?.id ?? (can('tasks:manage') ? NONE : me?.user.id ?? NONE), customerId: task?.customer?.id ?? NONE,
    });
  }, [open, task, reset, me, can]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); };
  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        title: v.title, description: v.description, status: v.status, priority: v.priority,
        // Due dates are end-of-day local time, so "due today" stays not-overdue until the day ends.
        dueAt: v.dueAt ? new Date(`${v.dueAt}T23:59:59`).toISOString() : null,
        assigneeId: v.assigneeId === NONE ? null : v.assigneeId,
        customerId: v.customerId === NONE ? null : v.customerId,
      };
      return task ? api.patch<Task>(`/tasks/${task.id}`, body) : api.post<Task>('/tasks', body);
    },
    onSuccess: () => { invalidate(); toast.success(task ? 'Task saved' : 'Task created'); onOpenChange(false); },
    onError: (err) => applyServerErrors(err, setError, ['title', 'description', 'assigneeId', 'customerId']),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/tasks/${task?.id}`),
    onSuccess: () => { invalidate(); toast.success('Task deleted'); setConfirmDelete(false); onOpenChange(false); },
    onError: (err) => { setConfirmDelete(false); toast.error(errorMessage(err)); },
  });
  const onSubmit = handleSubmit((v) => save.mutate(v));

  // Staff can only assign themselves; the API enforces this too.
  const assignable = (members.data?.data ?? []).filter((m) => can('tasks:manage') || m.user.id === me?.user.id);
  const canDelete = task && (task.createdBy?.id === me?.user.id || can('tasks:manage'));

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title={task ? 'Edit task' : 'New task'}
        footer={
          <>
            {canDelete && <Button variant="ghost" className="mr-auto text-rose" onClick={() => setConfirmDelete(true)}><Trash2 />Delete</Button>}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" loading={save.isPending} onClick={onSubmit}>{task ? 'Save task' : 'Create task'}</Button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field id="t-title" label="Title" error={errors.title?.message}><Input id="t-title" autoFocus aria-invalid={!!errors.title} {...register('title')} /></Field>
          <Field id="t-desc" label="Details" error={errors.description?.message}><Textarea id="t-desc" rows={4} {...register('description')} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="t-status" label="Status"><Controller control={control} name="status" render={({ field }) => <Select id="t-status" value={field.value} onValueChange={field.onChange} options={TASK_STATUSES.map((s) => ({ value: s, label: sentence(s) }))} />} /></Field>
            <Field id="t-priority" label="Priority"><Controller control={control} name="priority" render={({ field }) => <Select id="t-priority" value={field.value} onValueChange={field.onChange} options={TASK_PRIORITIES.map((s) => ({ value: s, label: sentence(s) }))} />} /></Field>
            <Field id="t-assignee" label="Assignee" error={errors.assigneeId?.message}>
              <Controller control={control} name="assigneeId" render={({ field }) => (
                <Select id="t-assignee" value={field.value} onValueChange={field.onChange} options={[{ value: NONE, label: 'Unassigned' }, ...assignable.map((m) => ({ value: m.user.id, label: m.user.id === me?.user.id ? `${m.user.name} (you)` : m.user.name }))]} />
              )} />
            </Field>
            <Field id="t-due" label="Due date"><Input id="t-due" type="date" {...register('dueAt')} /></Field>
          </div>
          <Field id="t-customer" label="Related customer (optional)" error={errors.customerId?.message}>
            <div className="flex gap-2">
              <AsyncPicker<CustomerRow>
                id="t-customer"
                queryKey="customers"
                placeholder="Search customers…"
                fetch={async (q) => (await api.get<Paginated<CustomerRow>>('/customers', { q, pageSize: 20, sort: 'name', dir: 'asc' })).data}
                getKey={(c) => c.id}
                renderItem={(c) => <><span className="flex-1 truncate">{c.name}</span><span className="text-xs text-faint">{c.company}</span></>}
                onSelect={(c) => { setValue('customerId', c.id); setCustomerName(c.name); }}
                trigger={customerName ?? <span className="text-faint">None</span>}
              />
              {customerName && <Button type="button" variant="ghost" onClick={() => { setValue('customerId', NONE); setCustomerName(null); }}>Clear</Button>}
            </div>
          </Field>
          <button type="submit" hidden />
        </form>
      </Sheet>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this task?" description={`“${task?.title}” will be removed for everyone.`} confirmLabel="Delete task" loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </>
  );
}
