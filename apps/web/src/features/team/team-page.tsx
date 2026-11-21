import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, UserPlus, UsersRound } from 'lucide-react';
import { canManageRole, emailSchema, PERMISSIONS, ROLES, type Role } from '@pulse/shared';
import { api, errorMessage } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';
import { useSession } from '@/lib/session';
import { date, sentence } from '@/lib/utils';
import type { Member } from '@/types/api';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, Td, Th, Tr } from '@/components/ui/table';

const ROLE_HINT: Record<Role, string> = {
  OWNER: 'Full control, including other owners and billing-level settings.',
  ADMIN: 'Manages settings, members (below admin) and refunds.',
  MANAGER: 'Runs operations: inventory, cancellations, payments, analytics.',
  STAFF: 'Day-to-day work: customers, orders and their own tasks.',
};

const addSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: emailSchema,
  role: z.enum(ROLES),
  initialPassword: z.string().max(128),
});
type AddValues = z.infer<typeof addSchema>;

function AddMemberDialog({ open, onOpenChange, myRole }: { open: boolean; onOpenChange: (o: boolean) => void; myRole: Role }) {
  const qc = useQueryClient();
  const { register, handleSubmit, control, reset, setError, formState: { errors } } = useForm<AddValues>({ resolver: zodResolver(addSchema) });
  useEffect(() => { if (open) reset({ name: '', email: '', role: 'STAFF', initialPassword: '' }); }, [open, reset]);
  const add = useMutation({
    mutationFn: (v: AddValues) => api.post('/members', { ...v, initialPassword: v.initialPassword || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); toast.success('Teammate added'); onOpenChange(false); },
    onError: (err) => applyServerErrors(err, setError, ['name', 'email', 'role', 'initialPassword']),
  });
  const onSubmit = handleSubmit((v) => add.mutate(v));
  const roles = ROLES.filter((r) => canManageRole(myRole, r));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add a teammate" description="If they already use PULSE, they’ll see this workspace next time they sign in. Otherwise, set a starting password and share it with them privately."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={add.isPending} onClick={onSubmit}>Add teammate</Button></>}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <Field id="m-name" label="Name" error={errors.name?.message}><Input id="m-name" autoFocus {...register('name')} /></Field>
        <Field id="m-email" label="Email" error={errors.email?.message}><Input id="m-email" type="email" {...register('email')} /></Field>
        <Field id="m-role" label="Role" hint={undefined}>
          <Controller control={control} name="role" render={({ field }) => (
            <>
              <Select id="m-role" value={field.value} onValueChange={field.onChange} options={roles.map((r) => ({ value: r, label: sentence(r) }))} />
              <p className="text-xs text-faint">{ROLE_HINT[field.value ?? 'STAFF']}</p>
            </>
          )} />
        </Field>
        <Field id="m-pass" label="Starting password (new accounts only)" hint="At least 10 characters with a letter and a number." error={errors.initialPassword?.message}><Input id="m-pass" type="password" autoComplete="new-password" {...register('initialPassword')} /></Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export default function TeamPage() {
  const { me, can } = useSession();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const q = useQuery({ queryKey: ['members'], queryFn: () => api.get<{ data: Member[] }>('/members') });
  const myRole = me?.role ?? 'STAFF';
  const manage = can('members:manage');

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.patch(`/members/${id}`, { role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); toast.success('Role updated'); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/members/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); toast.success('Teammate removed'); setRemoving(null); },
    onError: (err) => { setRemoving(null); toast.error(errorMessage(err)); },
  });

  return (
    <div>
      <PageHeader title="Team" description="Who can access this workspace and what each role can do." actions={manage && <Button variant="primary" onClick={() => setAdding(true)}><UserPlus />Add teammate</Button>} />
      <div className="panel mb-6">
        {q.isLoading ? <TableSkeleton rows={4} cols={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.data.length ? <EmptyState icon={UsersRound} title="No members" description="Add your team to share the workload." /> : (
          <Table>
            <thead><tr><Th>Member</Th><Th>Role</Th><Th className="hidden sm:table-cell">Joined</Th><Th className="w-12"><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {q.data.data.map((m) => {
                const self = m.user.id === me?.user.id;
                const editable = manage && !self && canManageRole(myRole, m.role);
                return (
                  <Tr key={m.id}>
                    <Td><span className="flex items-center gap-3"><Avatar name={m.user.name} className="size-8" /><span><span className="block font-medium">{m.user.name}{self && <Badge tone="faint" className="ml-2">You</Badge>}</span><span className="block text-xs text-faint">{m.user.email}</span></span></span></Td>
                    <Td className="w-44">
                      {editable ? (
                        <Select aria-label={`Role for ${m.user.name}`} value={m.role} onValueChange={(role) => changeRole.mutate({ id: m.id, role })} options={ROLES.filter((r) => canManageRole(myRole, r)).map((r) => ({ value: r, label: sentence(r) }))} />
                      ) : <Badge tone={m.role === 'OWNER' ? 'brass' : 'neutral'}>{sentence(m.role)}</Badge>}
                    </Td>
                    <Td className="hidden text-mist sm:table-cell">{date(m.joinedAt)}</Td>
                    <Td>{editable && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${m.user.name}`} onClick={() => setRemoving(m)}><Trash2 /></Button>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>

      <section className="panel" aria-label="Permissions by role">
        <h2 className="px-5 pb-2 pt-4 text-sm font-semibold">What each role can do</h2>
        <Table>
          <thead><tr><Th>Permission</Th>{ROLES.map((r) => <Th key={r} className="text-center">{sentence(r)}</Th>)}</tr></thead>
          <tbody>
            {(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((p) => (
              <Tr key={p}>
                <Td className="h-10 text-mist">{p.replace(':', ' · ')}</Td>
                {ROLES.map((r) => <Td key={r} className="h-10 text-center">{(PERMISSIONS[p] as readonly Role[]).includes(r) ? <span className="text-sage" aria-label="Allowed">●</span> : <span className="text-faint" aria-label="Not allowed">—</span>}</Td>)}
              </Tr>
            ))}
          </tbody>
        </Table>
      </section>

      <AddMemberDialog open={adding} onOpenChange={setAdding} myRole={myRole} />
      <ConfirmDialog open={!!removing} onOpenChange={(o) => { if (!o) setRemoving(null); }} title={`Remove ${removing?.user.name}?`} description="They lose access to this workspace immediately. Their open tasks become unassigned; their history stays in the audit log." confirmLabel="Remove teammate" loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} />
    </div>
  );
}
