import { Router } from 'express';
import { z } from 'zod';
import { loginSchema, passwordSchema, registerSchema, switchOrgSchema } from '@pulse/shared';
import { prisma } from '../../database/prisma';
import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/security';
import { handler, parse } from '../../utils/http';
import { unauthorized } from '../../utils/errors';
import * as auth from './auth.service';
import { clearSessionCookie, createSession } from './session';

export const authRouter = Router();

authRouter.post('/register', authLimiter, handler(async (req, res) => {
  const input = parse(registerSchema, req.body);
  const { user, organizationId } = await auth.register(input, req.ip ?? null);
  await createSession(res, user.id, organizationId, { ip: req.ip, userAgent: req.get('user-agent') });
  res.status(201).json(await auth.getMe(user.id, organizationId));
}));

authRouter.post('/login', authLimiter, handler(async (req, res) => {
  const input = parse(loginSchema, req.body);
  const { user, organizationId } = await auth.verifyCredentials(input);
  await createSession(res, user.id, organizationId, { ip: req.ip, userAgent: req.get('user-agent') });
  res.json(await auth.getMe(user.id, organizationId));
}));

authRouter.post('/logout', handler(async (req, res) => {
  if (req.auth) await prisma.session.deleteMany({ where: { id: req.auth.sessionId } });
  clearSessionCookie(res);
  res.status(204).end();
}));

authRouter.get('/me', requireAuth, handler(async (req, res) => {
  if (!req.auth) throw unauthorized();
  res.json(await auth.getMe(req.auth.userId, req.auth.activeOrganizationId));
}));

authRouter.post('/switch-organization', requireAuth, handler(async (req, res) => {
  if (!req.auth) throw unauthorized();
  const { organizationId } = parse(switchOrgSchema, req.body);
  await auth.switchOrganization(req.auth.sessionId, req.auth.userId, organizationId);
  res.json(await auth.getMe(req.auth.userId, organizationId));
}));

authRouter.post('/change-password', authLimiter, requireAuth, handler(async (req, res) => {
  if (!req.auth) throw unauthorized();
  const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
  await auth.changePassword(req.auth.userId, body.currentPassword, body.newPassword, req.auth.sessionId);
  res.status(204).end();
}));
