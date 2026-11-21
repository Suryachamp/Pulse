import { Router } from 'express';
import { ctxOf } from '../../middleware/auth';
import { handler, idParam } from '../../utils/http';
import * as svc from './notifications.service';

/** Notifications belong to the signed-in user, so membership is the only permission needed. */
export const notificationsRouter = Router();

notificationsRouter.get('/', handler(async (req, res) => {
  res.json(await svc.listNotifications(ctxOf(req), req.query.unread === 'true'));
}));
notificationsRouter.post('/read-all', handler(async (req, res) => {
  await svc.markAllRead(ctxOf(req));
  res.status(204).end();
}));
notificationsRouter.post('/:id/read', handler(async (req, res) => {
  await svc.markRead(ctxOf(req), idParam(req, 'id', 'Notification'));
  res.status(204).end();
}));
