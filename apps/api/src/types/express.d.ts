import type { Role } from '@pulse/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; sessionId: string; activeOrganizationId: string | null };
      /** Set by requireOrg: the verified tenant context for this request. */
      ctx?: OrgContext;
    }
  }
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  role: Role;
  ip: string | null;
}
