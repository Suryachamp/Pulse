import { Router } from 'express';
import { z } from 'zod';
import { dateRangeQuery } from '@pulse/shared';
import { ctxOf, requirePermission } from '../../middleware/auth';
import { handler, parse } from '../../utils/http';
import { listAudit } from '../audit/audit.service';
import * as analytics from './analytics.service';
import { dashboard } from './dashboard.service';

export const analyticsRouter = Router();

const range = (q: unknown) => {
  const r = parse(dateRangeQuery, q);
  return { from: r.from, to: r.to };
};

analyticsRouter.get('/summary', requirePermission('analytics:read'), handler(async (req, res) => {
  res.json(await analytics.summary(ctxOf(req), range(req.query)));
}));
analyticsRouter.get('/timeseries', requirePermission('analytics:read'), handler(async (req, res) => {
  res.json(await analytics.timeseries(ctxOf(req), range(req.query)));
}));
analyticsRouter.get('/breakdown', requirePermission('analytics:read'), handler(async (req, res) => {
  const ctx = ctxOf(req);
  const r = range(req.query);
  const [ordersByStatus, topProducts, inventory, aging, methods] = await Promise.all([
    analytics.ordersByStatus(ctx, r),
    analytics.topProducts(ctx, r),
    analytics.inventoryHealth(ctx),
    analytics.receivablesAging(ctx),
    analytics.paymentMethods(ctx, r),
  ]);
  res.json({ ordersByStatus, topProducts, inventory, aging, methods });
}));

export const dashboardRouter = Router();
dashboardRouter.get('/', handler(async (req, res) => {
  res.json(await dashboard(ctxOf(req)));
}));

const auditQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  q: z.string().trim().max(200).optional(),
  entityType: z.enum(['Order', 'Customer', 'Product', 'Task', 'Membership', 'Organization']).optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
});

export const auditRouter = Router();
auditRouter.get('/activity', requirePermission('activity:read'), handler(async (req, res) => {
  res.json(await listAudit(ctxOf(req), parse(auditQuery, req.query), false));
}));
auditRouter.get('/audit-logs', requirePermission('audit:read'), handler(async (req, res) => {
  res.json(await listAudit(ctxOf(req), parse(auditQuery, req.query), true));
}));
