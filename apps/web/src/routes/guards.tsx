import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import type { Permission } from '@pulse/shared';
import { useSession } from '@/lib/session';
import { EmptyState } from '@/components/ui/feedback';
import { LogoMark } from '@/components/brand/logo';

export function FullPageLoader() {
  return (
    <div className="grid min-h-screen place-items-center" role="status" aria-label="Loading">
      <LogoMark className="size-10 animate-pulse" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { me, isLoading } = useSession();
  if (isLoading) return <FullPageLoader />;
  if (me) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/** Hides pages the role cannot use. The API still rejects the underlying requests. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession();
  if (!can(permission)) {
    return <EmptyState icon={ShieldOff} title="You don’t have access to this page" description="Ask an owner or admin in your organization if you need it." />;
  }
  return <>{children}</>;
}
