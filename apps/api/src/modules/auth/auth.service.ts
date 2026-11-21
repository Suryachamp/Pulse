import argon2 from 'argon2';
import { permissionsFor, type LoginInput, type RegisterInput } from '@pulse/shared';
import { prisma } from '../../database/prisma';
import { unauthorized, forbidden, notFound } from '../../utils/errors';
import { audit } from '../audit/audit.service';

// A precomputed hash so failed logins for unknown emails take as long as real ones.
const DUMMY_HASH = argon2.hash('pulse-timing-equalizer-password');

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function register(input: RegisterInput, ip: string | null) {
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash } });
    const org = await tx.organization.create({ data: { name: input.organizationName, slug: slugify(input.organizationName) } });
    await tx.membership.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
    await audit(tx, { organizationId: org.id, userId: user.id, ip }, {
      action: 'organization.created',
      entityType: 'Organization',
      entityId: org.id,
      summary: `${user.name} created ${org.name}`,
    });
    return { user, organizationId: org.id };
  });
}

export async function verifyCredentials(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await argon2.verify(user?.passwordHash ?? (await DUMMY_HASH), input.password);
  if (!user || !ok) throw unauthorized('Email or password is incorrect');
  const first = await prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  return { user, organizationId: first?.organizationId ?? null };
}

export async function getMe(userId: string, activeOrganizationId: string | null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      memberships: { select: { role: true, organization: { select: { id: true, name: true, slug: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!user) throw unauthorized();
  const active = user.memberships.find((m) => m.organization.id === activeOrganizationId) ?? null;
  const organization = active
    ? await prisma.organization.findUnique({
        where: { id: active.organization.id },
        select: { id: true, name: true, slug: true, currency: true, defaultLowStockThreshold: true, defaultTaxRateBps: true },
      })
    : null;
  return {
    user: { id: user.id, email: user.email, name: user.name },
    organizations: user.memberships.map((m) => ({ ...m.organization, role: m.role })),
    organization,
    role: active?.role ?? null,
    permissions: active ? permissionsFor(active.role) : [],
  };
}

export async function switchOrganization(sessionId: string, userId: string, organizationId: string) {
  const membership = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!membership) throw notFound('Organization');
  await prisma.session.update({ where: { id: sessionId }, data: { activeOrganizationId: organizationId } });
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await argon2.verify(user.passwordHash, current))) throw forbidden('Current password is incorrect');
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } }),
    // Changing a password signs out every other device.
    prisma.session.deleteMany({ where: { userId, id: { not: keepSessionId } } }),
  ]);
}
