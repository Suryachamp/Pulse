import { canManageRole, type AddMemberInput, type Role, type UpdateOrgInput } from '@pulse/shared';
import { prisma } from '../../database/prisma';
import type { OrgContext } from '../../types/express';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { audit } from '../audit/audit.service';
import { hashPassword } from '../auth/auth.service';

export async function updateOrganization(ctx: OrgContext, input: UpdateOrgInput) {
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.update({ where: { id: ctx.organizationId }, data: input });
    await audit(tx, ctx, { action: 'organization.updated', entityType: 'Organization', entityId: org.id, summary: 'Updated organization settings', metadata: { ...input } });
    return org;
  });
}

export async function listMembers(ctx: OrgContext) {
  const rows = await prisma.membership.findMany({
    where: { organizationId: ctx.organizationId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((m) => ({ id: m.id, role: m.role, joinedAt: m.createdAt, user: m.user }));
}

export async function addMember(ctx: OrgContext, input: AddMemberInput) {
  if (!canManageRole(ctx.role, input.role)) throw forbidden(`You cannot add members with the ${input.role} role`);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (!existing && !input.initialPassword) {
    throw badRequest('This person does not have a PULSE account yet. Set an initial password for them.', { fields: { initialPassword: ['Required for new accounts'] } });
  }
  const passwordHash = existing ? null : await hashPassword(input.initialPassword ?? '');
  return prisma.$transaction(async (tx) => {
    const user = existing ?? (await tx.user.create({ data: { email: input.email, name: input.name, passwordHash: passwordHash ?? '' } }));
    const dup = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: user.id } } });
    if (dup) throw conflict('This person is already a member');
    const m = await tx.membership.create({ data: { organizationId: ctx.organizationId, userId: user.id, role: input.role } });
    await audit(tx, ctx, { action: 'member.added', entityType: 'Membership', entityId: m.id, summary: `Added ${user.name} as ${input.role}`, metadata: { userId: user.id, role: input.role } });
    return { id: m.id, role: m.role, joinedAt: m.createdAt, user: { id: user.id, name: user.name, email: user.email } };
  });
}

async function loadManageable(ctx: OrgContext, membershipId: string) {
  const m = await prisma.membership.findFirst({ where: { id: membershipId, organizationId: ctx.organizationId }, include: { user: true } });
  if (!m) throw notFound('Member');
  if (m.userId === ctx.userId) throw forbidden('You cannot change your own membership');
  if (!canManageRole(ctx.role, m.role)) throw forbidden(`You cannot manage a member with the ${m.role} role`);
  return m;
}

export async function updateMemberRole(ctx: OrgContext, membershipId: string, role: Role) {
  const m = await loadManageable(ctx, membershipId);
  if (!canManageRole(ctx.role, role)) throw forbidden(`You cannot grant the ${role} role`);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.membership.update({ where: { id: m.id }, data: { role } });
    await audit(tx, ctx, { action: 'member.role_changed', entityType: 'Membership', entityId: m.id, summary: `Changed ${m.user.name}'s role from ${m.role} to ${role}`, metadata: { from: m.role, to: role } });
    return updated;
  });
}

export async function removeMember(ctx: OrgContext, membershipId: string) {
  const m = await loadManageable(ctx, membershipId);
  await prisma.$transaction(async (tx) => {
    if (m.role === 'OWNER') {
      const owners = await tx.membership.count({ where: { organizationId: ctx.organizationId, role: 'OWNER' } });
      if (owners <= 1) throw conflict('An organization must keep at least one owner');
    }
    // Open work should not stay assigned to someone who can no longer see it.
    await tx.task.updateMany({ where: { organizationId: ctx.organizationId, assigneeId: m.userId, status: { not: 'DONE' } }, data: { assigneeId: null } });
    await tx.session.updateMany({ where: { userId: m.userId, activeOrganizationId: ctx.organizationId }, data: { activeOrganizationId: null } });
    await tx.membership.delete({ where: { id: m.id } });
    await audit(tx, ctx, { action: 'member.removed', entityType: 'Membership', entityId: m.id, summary: `Removed ${m.user.name}`, metadata: { userId: m.userId, role: m.role } });
  });
}

export async function assertMember(organizationId: string, userId: string) {
  const m = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!m) throw badRequest('Assignee must be a member of this organization', { fields: { assigneeId: ['Not a member'] } });
}
