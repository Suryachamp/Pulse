import type { Role } from './enums';

/**
 * Explicit permission matrix. The API enforces these on every protected route;
 * the web app only uses them to hide controls a user cannot use.
 */
export const PERMISSIONS = {
  'org:manage': ['OWNER', 'ADMIN'],
  'members:read': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'members:manage': ['OWNER', 'ADMIN'],
  'customers:read': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'customers:write': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'customers:delete': ['OWNER', 'ADMIN', 'MANAGER'],
  'products:read': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'products:write': ['OWNER', 'ADMIN', 'MANAGER'],
  'inventory:adjust': ['OWNER', 'ADMIN', 'MANAGER'],
  'orders:read': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'orders:write': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'orders:cancel': ['OWNER', 'ADMIN', 'MANAGER'],
  'payments:read': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'payments:record': ['OWNER', 'ADMIN', 'MANAGER'],
  'payments:refund': ['OWNER', 'ADMIN'],
  'tasks:read': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'tasks:write': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'tasks:manage': ['OWNER', 'ADMIN', 'MANAGER'],
  'analytics:read': ['OWNER', 'ADMIN', 'MANAGER'],
  'activity:read': ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'],
  'audit:read': ['OWNER', 'ADMIN'],
  'data:export': ['OWNER', 'ADMIN', 'MANAGER'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}

const RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, MANAGER: 2, STAFF: 1 };

/** Owners manage anyone; admins manage only managers and staff. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return RANK[target] < RANK.ADMIN;
  return false;
}
