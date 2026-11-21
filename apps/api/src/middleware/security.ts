import type { RequestHandler } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { env, isTest } from '../config/env';
import { AppError } from '../utils/errors';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie auth. Browsers always send Origin on cross-site
 * state-changing requests; we reject any that does not match the web app, and
 * require a JSON body so HTML forms cannot forge requests.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== env.WEB_ORIGIN) return next(new AppError(403, 'BAD_ORIGIN', 'Cross-origin request rejected'));
  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding');
  if (hasBody && !req.is('application/json')) return next(new AppError(415, 'UNSUPPORTED_MEDIA', 'Send JSON'));
  next();
};

const limitHandler: Options['handler'] = (_req, res) => {
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.' } });
};

export const apiLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => isTest, handler: limitHandler });

/** Tighter limit on credential endpoints to slow down password guessing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest && process.env.TEST_RATE_LIMIT !== '1',
  handler: limitHandler,
});
