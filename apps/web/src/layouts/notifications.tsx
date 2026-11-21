import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';
import { Bell, CheckCheck, Boxes, CreditCard, ListChecks, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { ago, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import type { Notification } from '@/types/api';

const ICON = { LOW_STOCK: Boxes, TASK_ASSIGNED: ListChecks, ORDER_STATUS: ShoppingBag, PAYMENT_RECORDED: CreditCard } as const;

export function NotificationsButton() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ data: Notification[]; unread: number }>('/notifications'),
    refetchInterval: 60_000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: invalidate });
  const readOne = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: invalidate });
  const unread = data?.unread ?? 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
          <Bell />
          {unread > 0 && <span className="tnum absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-brass px-1 text-[0.625rem] font-semibold leading-4 text-canvas">{unread > 9 ? '9+' : unread}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="glass z-50 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-line shadow-lift">
          <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <Button size="sm" variant="ghost" disabled={!unread} loading={readAll.isPending} onClick={() => readAll.mutate()}><CheckCheck />Mark all read</Button>
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {!data?.data.length ? (
              <EmptyState icon={Bell} title="You’re all caught up" description="Low stock, task assignments and payment updates will show up here." />
            ) : (
              data.data.map((n) => {
                const Icon = ICON[n.type];
                return (
                  <Popover.Close asChild key={n.id}>
                    <button
                      type="button"
                      className={cn('flex w-full gap-3 border-b border-line/40 px-4 py-3 text-left transition-colors hover:bg-raised/60', !n.readAt && 'bg-brass/[0.04]')}
                      onClick={() => {
                        if (!n.readAt) readOne.mutate(n.id);
                        if (n.link) navigate(n.link);
                      }}
                    >
                      <Icon className={cn('mt-0.5 size-4 shrink-0', n.readAt ? 'text-faint' : 'text-brass')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{n.title}</span>
                        <span className="block truncate text-xs text-mist">{n.body}</span>
                        <span className="mt-1 block text-2xs text-faint">{ago(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brass" aria-label="Unread" />}
                    </button>
                  </Popover.Close>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
