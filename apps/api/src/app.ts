import express, { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './database/prisma';
import { loadSession, requireAuth, requireOrg } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiLimiter, csrfGuard } from './middleware/security';
import { authRouter } from './modules/auth/auth.routes';
import { organizationRouter } from './modules/organization/organization.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { productsRouter } from './modules/inventory/inventory.routes';
import { ordersRouter, paymentsRouter } from './modules/orders/orders.routes';
import { tasksRouter } from './modules/tasks/tasks.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { analyticsRouter, auditRouter, dashboardRouter } from './modules/analytics/analytics.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    prisma.$queryRaw`SELECT 1`
      .then(() => res.json({ status: 'ok' }))
      .catch(() => res.status(503).json({ status: 'degraded' }));
  });

  const api = Router();
  api.use(apiLimiter, csrfGuard, loadSession);
  api.use('/auth', authRouter);

  // Everything below requires a session and a verified membership in the active organization.
  const tenant = Router();
  tenant.use(requireAuth, requireOrg);
  tenant.use('/', organizationRouter);
  tenant.use('/customers', customersRouter);
  tenant.use('/products', productsRouter);
  tenant.use('/orders', ordersRouter);
  tenant.use('/payments', paymentsRouter);
  tenant.use('/tasks', tasksRouter);
  tenant.use('/notifications', notificationsRouter);
  tenant.use('/analytics', analyticsRouter);
  tenant.use('/dashboard', dashboardRouter);
  tenant.use('/', auditRouter);
  api.use(tenant);

  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
