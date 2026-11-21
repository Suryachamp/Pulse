import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType, ZodTypeDef } from 'zod';
import { notFound } from './errors';

/** Express 4 does not forward rejected promises; this does. */
export const handler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, data: unknown): T {
  return schema.parse(data);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids that are not UUIDs can never exist; answer 404 rather than leaking a DB error. */
export function idParam(req: Request, name = 'id', entity = 'Resource'): string {
  const value = req.params[name];
  if (!value || !UUID.test(value)) throw notFound(entity);
  return value;
}

export function paginate<T>(data: T[], total: number, page: number, pageSize: number) {
  return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
