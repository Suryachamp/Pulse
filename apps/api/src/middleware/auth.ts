import type { Request, RequestHandler } from 'express';
import { can, type Permission } from '@pulse/shared';
import { prisma } from '../database/prisma';
import { forbidden, unauthorized } from '../utils/errors';
import { hashToken, SESSION_COOKIE, touchSession } from '../modules/auth/session';
import type { OrgContext } from '../types/express';

/** Resolves the session cookie (if any). Never rejects; use requireAuth for that. */
export const loadSession: RequestHandler = (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length < 20) return next();
  prisma.session
    .findUnique({ where: { id: hashToken(token) } })
    .then(async (session) => {
      if (session && session.expiresAt > new Date()) {
        req.auth = { userId: session.userId, sessionId: session.id, activeOrganizationId: session.activeOrganizationId };
        await touchSession(session);
      }
      next();
    })
    .catch(next);
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  next();
};

/**
 * Verifies the user is still a member of their active organization and loads their
 * current role from the database on every request, so removals and role changes
 * take effect immediately.
 */
export const requireOrg: RequestHandler = (req, _res, next) => {
  const auth = req.auth;
  if (!auth) return next(unauthorized());
  if (!auth.activeOrganizationId) return next(forbidden('Select an organization first'));
  prisma.membership
    .findUnique({ where: { organizationId_userId: { organizationId: auth.activeOrganizationId, userId: auth.userId } } })
    .then((m) => {
      if (!m) return next(forbidden('You are no longer a member of this organization'));
      req.ctx = { userId: auth.userId, organizationId: m.organizationId, role: m.role, ip: req.ip ?? null };
      next();
    })
    .catch(next);
};

export const requirePermission =
  (permission: Permission): RequestHandler =>
  (req, _res, next) => {
    if (!req.ctx) return next(unauthorized());
    if (!can(req.ctx.role, permission)) return next(forbidden());
    next();
  };

export function ctxOf(req: Request): OrgContext {
  if (!req.ctx) throw unauthorized();
  return req.ctx;
}
