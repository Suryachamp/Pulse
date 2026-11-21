import type { NotificationType, Role } from '@prisma/client';
import { prisma, type Tx } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { notFound } from '../../utils/errors';

interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export async function notifyUsers(tx: Tx, organizationId: string, userIds: string[], payload: NotificationPayload) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await tx.notification.createMany({ data: unique.map((userId) => ({ organizationId, userId, ...payload })) });
}

export async function notifyRoles(tx: Tx, organizationId: string, roles: Role[], payload: NotificationPayload, excludeUserId?: string) {
  const members = await tx.membership.findMany({ where: { organizationId, role: { in: roles } }, select: { userId: true } });
  await notifyUsers(tx, organizationId, members.map((m) => m.userId).filter((id) => id !== excludeUserId), payload);
}

export async function listNotifications(ctx: OrgContext, unreadOnly: boolean) {
  const where = { organizationId: ctx.organizationId, userId: ctx.userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [data, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { organizationId: ctx.organizationId, userId: ctx.userId, readAt: null } }),
  ]);
  return { data, unread };
}

export async function markRead(ctx: OrgContext, id: string) {
  const res = await prisma.notification.updateMany({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId, readAt: null }, data: { readAt: new Date() } });
  if (res.count === 0) {
    const exists = await prisma.notification.count({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId } });
    if (!exists) throw notFound('Notification');
  }
}

export async function markAllRead(ctx: OrgContext) {
  await prisma.notification.updateMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId, readAt: null }, data: { readAt: new Date() } });
}
