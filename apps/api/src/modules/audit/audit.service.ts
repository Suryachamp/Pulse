import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { paginate } from '../../utils/http';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Prisma.InputJsonObject;
}

/** Always called inside the same transaction as the change it records. */
export function audit(tx: Tx, ctx: Pick<OrgContext, 'organizationId' | 'userId' | 'ip'>, entry: AuditEntry) {
  return tx.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      ip: ctx.ip,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      metadata: entry.metadata ?? {},
    },
  });
}

export interface AuditListQuery {
  page: number;
  pageSize: number;
  q?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
}

/**
 * `full` returns metadata and IP (audit:read); otherwise a sanitized activity feed (activity:read).
 */
export async function listAudit(ctx: OrgContext, query: AuditListQuery, full: boolean) {
  const where: Prisma.AuditLogWhereInput = {
    organizationId: ctx.organizationId,
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.q ? { OR: [{ summary: { contains: query.q, mode: 'insensitive' } }, { action: { contains: query.q, mode: 'insensitive' } }] } : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { actor: { select: { id: true, name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const data = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    actor: r.actor,
    createdAt: r.createdAt,
    ...(full ? { metadata: r.metadata, ip: r.ip } : {}),
  }));
  return paginate(data, total, query.page, query.pageSize);
}
