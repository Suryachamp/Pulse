import { createHash, randomBytes } from 'node:crypto';
import type { Response, CookieOptions } from 'express';
import type { Session } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { env, isProd } from '../../config/env';

export const SESSION_COOKIE = isProd ? '__Host-pulse_session' : 'pulse_session';
const DAY = 24 * 60 * 60 * 1000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: env.SESSION_TTL_DAYS * DAY,
});

export async function createSession(res: Response, userId: string, activeOrganizationId: string | null, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      activeOrganizationId,
      expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * DAY),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res: Response) {
  const { maxAge: _maxAge, ...opts } = cookieOptions();
  res.clearCookie(SESSION_COOKIE, opts);
}

/** Sliding expiry, written at most once per hour to keep reads cheap. */
export async function touchSession(session: Session) {
  if (Date.now() - session.lastSeenAt.getTime() < 60 * 60 * 1000) return;
  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + env.SESSION_TTL_DAYS * DAY) },
  });
}
