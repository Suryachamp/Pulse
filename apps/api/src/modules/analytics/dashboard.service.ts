import { can, formatMoney } from '@pulse/shared';
import { prisma } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { lowStockProducts } from '../inventory/products.service';
import { taskSummary } from '../tasks/tasks.service';
import { overdueSummary } from '../orders/invoice.service';
import * as analytics from './analytics.service';

const DAY = 86_400_000;

async function alerts(ctx: OrgContext, lowStockCount: number, overdueTasks: number) {
  const now = Date.now();
  const canSeeMoney = can(ctx.role, 'analytics:read');
  const [awaiting, overdue] = await Promise.all([
    prisma.order.count({ where: { organizationId: ctx.organizationId, status: 'CONFIRMED', confirmedAt: { lt: new Date(now - 3 * DAY) } } }),
    canSeeMoney ? overdueSummary(ctx.organizationId) : null,
  ]);
  const list: { id: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string; href: string }[] = [];
  if (lowStockCount) list.push({ id: 'low-stock', severity: 'warning', title: `${lowStockCount} product${lowStockCount === 1 ? '' : 's'} at or below threshold`, description: 'Restock soon to avoid rejected orders.', href: '/app/inventory?stock=low' });
  if (overdueTasks) list.push({ id: 'overdue-tasks', severity: 'critical', title: `${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`, description: 'Past their due date and still open.', href: '/app/tasks?overdue=true' });
  if (awaiting) list.push({ id: 'awaiting-fulfilment', severity: 'warning', title: `${awaiting} order${awaiting === 1 ? '' : 's'} waiting over 3 days`, description: 'Confirmed but not yet fulfilled.', href: '/app/orders?status=CONFIRMED' });
  // Uses each invoice's due date (confirmation + payment terms), not a fixed age.
  if (overdue?.count) list.push({ id: 'overdue-invoices', severity: 'critical', title: `${overdue.count} invoice${overdue.count === 1 ? '' : 's'} overdue`, description: `${formatMoney(overdue.cents)} is past its due date. Follow up with these customers.`, href: '/app/orders?overdue=true' });
  return list;
}

/** Revenue figures are only included for roles with analytics:read. */
export async function dashboard(ctx: OrgContext) {
  const to = new Date();
  const range = { from: new Date(to.getTime() - 30 * DAY), to };
  const canSeeMoney = can(ctx.role, 'analytics:read');
  const [lowStock, tasks, activity, health, onboarding] = await Promise.all([
    lowStockProducts(ctx, 6),
    taskSummary(ctx),
    prisma.auditLog.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, summary: true, entityType: true, entityId: true, createdAt: true, actor: { select: { id: true, name: true } } },
    }),
    analytics.inventoryHealth(ctx),
    onboardingState(ctx),
  ]);
  const lowCount = (health?.low ?? 0) + (health?.out ?? 0);
  const money = canSeeMoney
    ? await Promise.all([analytics.summary(ctx, range), analytics.timeseries(ctx, range)]).then(([summary, series]) => ({ summary, series }))
    : null;
  return {
    range,
    money,
    lowStock,
    lowStockCount: lowCount,
    tasks,
    activity,
    alerts: await alerts(ctx, lowCount, tasks.overdue),
    onboarding,
  };
}

/** Real onboarding progress derived from what the organization has actually set up. */
async function onboardingState(ctx: OrgContext) {
  const where = { organizationId: ctx.organizationId };
  const [products, customers, orders, members, payments] = await Promise.all([
    prisma.product.count({ where }),
    prisma.customer.count({ where }),
    prisma.order.count({ where }),
    prisma.membership.count({ where }),
    prisma.payment.count({ where }),
  ]);
  return [
    { id: 'product', label: 'Add your first product', done: products > 0, href: '/app/inventory?new=1' },
    { id: 'customer', label: 'Add a customer', done: customers > 0, href: '/app/customers?new=1' },
    { id: 'order', label: 'Create an order', done: orders > 0, href: '/app/orders/new' },
    { id: 'payment', label: 'Record a payment', done: payments > 0, href: '/app/orders' },
    { id: 'team', label: 'Invite a teammate', done: members > 1, href: '/app/team' },
  ];
}
