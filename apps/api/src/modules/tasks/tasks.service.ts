import type { z } from 'zod';
import { can, type TaskListQuery, type taskInputSchema, type taskUpdateSchema } from '@pulse/shared';
import type { Task } from '@prisma/client';
import { Prisma, prisma, type Tx } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import { paginate } from '../../utils/http';
import { audit } from '../audit/audit.service';
import { notifyUsers } from '../notifications/notifications.service';
import { assertMember } from '../organization/organization.service';

type TaskCreate = z.output<typeof taskInputSchema>;
type TaskUpdate = z.output<typeof taskUpdateSchema>;

const include = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  order: { select: { id: true, number: true } },
} satisfies Prisma.TaskInclude;

export const withOverdue = <T extends Pick<Task, 'dueAt' | 'status'>>(t: T, now = new Date()) => ({
  ...t,
  isOverdue: t.status !== 'DONE' && t.dueAt !== null && t.dueAt < now,
});

/** Staff may only assign work to themselves; managers and above may assign anyone in the org. */
async function validateRefs(tx: Tx, ctx: OrgContext, input: Partial<TaskCreate>) {
  if (input.assigneeId) {
    if (input.assigneeId !== ctx.userId && !can(ctx.role, 'tasks:manage')) throw forbidden('Only managers can assign tasks to other people');
    await assertMember(ctx.organizationId, input.assigneeId);
  }
  if (input.customerId && !(await tx.customer.count({ where: { id: input.customerId, organizationId: ctx.organizationId } }))) {
    throw badRequest('Linked customer not found', { fields: { customerId: ['Not found'] } });
  }
  if (input.orderId && !(await tx.order.count({ where: { id: input.orderId, organizationId: ctx.organizationId } }))) {
    throw badRequest('Linked order not found', { fields: { orderId: ['Not found'] } });
  }
}

export async function listTasks(ctx: OrgContext, q: TaskListQuery) {
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    organizationId: ctx.organizationId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.priority ? { priority: q.priority } : {}),
    ...(q.assigneeId === 'me' ? { assigneeId: ctx.userId } : q.assigneeId === 'unassigned' ? { assigneeId: null } : q.assigneeId ? { assigneeId: q.assigneeId } : {}),
    ...(q.overdue ? { status: { not: 'DONE' }, dueAt: { lt: now } } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.task.findMany({ where, include, orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.task.count({ where }),
  ]);
  return paginate(rows.map((t) => withOverdue(t, now)), total, q.page, q.pageSize);
}

export async function taskSummary(ctx: OrgContext) {
  const now = new Date();
  const [byStatus, overdue, dueSoon] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where: { organizationId: ctx.organizationId }, _count: true }),
    prisma.task.count({ where: { organizationId: ctx.organizationId, status: { not: 'DONE' }, dueAt: { lt: now } } }),
    prisma.task.count({ where: { organizationId: ctx.organizationId, status: { not: 'DONE' }, dueAt: { gte: now, lt: new Date(now.getTime() + 2 * 86_400_000) } } }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count])) as Record<string, number>;
  const total = byStatus.reduce((n, s) => n + s._count, 0);
  return { total, done: counts.DONE ?? 0, open: total - (counts.DONE ?? 0), overdue, dueSoon, byStatus: counts };
}

export async function createTask(ctx: OrgContext, input: TaskCreate) {
  return prisma.$transaction(async (tx) => {
    await validateRefs(tx, ctx, input);
    const last = await tx.task.aggregate({ where: { organizationId: ctx.organizationId, status: input.status }, _max: { position: true } });
    const task = await tx.task.create({
      data: {
        ...input,
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
        position: (last._max.position ?? 0) + 1024,
        completedAt: input.status === 'DONE' ? new Date() : null,
      },
      include,
    });
    await audit(tx, ctx, { action: 'task.created', entityType: 'Task', entityId: task.id, summary: `Created task "${task.title}"` });
    if (task.assigneeId && task.assigneeId !== ctx.userId) {
      await notifyUsers(tx, ctx.organizationId, [task.assigneeId], { type: 'TASK_ASSIGNED', title: 'New task assigned to you', body: task.title, link: `/app/tasks?task=${task.id}` });
    }
    return withOverdue(task);
  });
}

async function loadEditable(tx: Tx, ctx: OrgContext, id: string) {
  const task = await tx.task.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!task) throw notFound('Task');
  const own = task.assigneeId === ctx.userId || task.createdById === ctx.userId;
  if (!own && !can(ctx.role, 'tasks:manage')) throw forbidden('You can only change tasks assigned to or created by you');
  return task;
}

export async function updateTask(ctx: OrgContext, id: string, input: TaskUpdate) {
  return prisma.$transaction(async (tx) => {
    const existing = await loadEditable(tx, ctx, id);
    if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) await validateRefs(tx, ctx, { assigneeId: input.assigneeId });
    await validateRefs(tx, ctx, { customerId: input.customerId, orderId: input.orderId });
    const statusChanged = input.status !== undefined && input.status !== existing.status;
    const task = await tx.task.update({
      where: { id },
      data: { ...input, ...(statusChanged ? { completedAt: input.status === 'DONE' ? new Date() : null } : {}) },
      include,
    });
    const fields = Object.keys(input).filter((k) => k !== 'position');
    if (fields.length) {
      await audit(tx, ctx, {
        action: statusChanged ? 'task.status_changed' : 'task.updated',
        entityType: 'Task',
        entityId: id,
        summary: statusChanged ? `Moved "${task.title}" to ${task.status.replace('_', ' ').toLowerCase()}` : `Updated task "${task.title}"`,
        metadata: { fields, ...(statusChanged ? { from: existing.status, to: task.status } : {}) },
      });
    }
    if (task.assigneeId && task.assigneeId !== existing.assigneeId && task.assigneeId !== ctx.userId) {
      await notifyUsers(tx, ctx.organizationId, [task.assigneeId], { type: 'TASK_ASSIGNED', title: 'Task assigned to you', body: task.title, link: `/app/tasks?task=${task.id}` });
    }
    return withOverdue(task);
  });
}

export async function deleteTask(ctx: OrgContext, id: string) {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!task) throw notFound('Task');
    if (task.createdById !== ctx.userId && !can(ctx.role, 'tasks:manage')) throw forbidden('Only the creator or a manager can delete this task');
    await tx.task.delete({ where: { id } });
    await audit(tx, ctx, { action: 'task.deleted', entityType: 'Task', entityId: id, summary: `Deleted task "${task.title}"` });
  });
}
