import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as D from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronsUpDown, LogOut, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search, Settings } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useSession, ME_KEY } from '@/lib/session';
import { cn, sentence } from '@/lib/utils';
import type { Me } from '@/types/api';
import { Logo, LogoMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Avatar, Kbd, Skeleton } from '@/components/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tip } from '@/components/ui/menu';
import { CommandPaletteProvider, usePalette } from './command-palette';
import { NotificationsButton } from './notifications';
import { NAV_SECTIONS } from './nav';

const COLLAPSE_KEY = 'pulse.sidebar.collapsed';
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
};

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { can } = useSession();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((i) => !i.permission || can(i.permission));
        if (!items.length) return null;
        return (
          <div key={section.label}>
            {!collapsed && <p className="mb-1.5 px-3 text-xs text-faint">{section.label}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.to === '/app'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-mist transition-colors hover:bg-raised/60 hover:text-ink',
                        isActive && 'bg-raised text-ink',
                        collapsed && 'justify-center px-0',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brass" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                        <item.icon className={cn('size-[1.05rem] shrink-0', isActive ? 'text-brass' : 'text-faint group-hover:text-mist')} aria-hidden />
                        {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
                      </>
                    )}
                  </NavLink>
                );
                return <li key={item.to}>{collapsed ? <Tip label={item.label}>{link}</Tip> : link}</li>;
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function OrgMenu({ collapsed }: { collapsed: boolean }) {
  const { me, setMe } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (!me?.organization) return null;
  const switchTo = async (id: string) => {
    try {
      const next = await api.post<Me>('/auth/switch-organization', { organizationId: id });
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
      setMe(next);
      navigate('/app');
      toast.success(`Switched to ${next.organization?.name}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className={cn('flex w-full items-center gap-2.5 rounded-lg border border-line/70 bg-canvas/40 p-2 text-left transition-colors hover:border-line hover:bg-raised/50', collapsed && 'justify-center border-transparent bg-transparent')}>
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brass/15 text-xs font-semibold text-brass">{me.organization.name[0]}</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{me.organization.name}</span>
                <span className="block text-2xs text-faint">{sentence(me.role ?? '')}</span>
              </span>
              <ChevronsUpDown className="size-4 text-faint" aria-hidden />
            </>
          )}
          {collapsed && <span className="sr-only">Switch organization</span>}
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>Organizations</MenuLabel>
        {me.organizations.map((o) => (
          <MenuItem key={o.id} onSelect={() => o.id !== me.organization?.id && switchTo(o.id)}>
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === me.organization?.id && <Check className="!text-brass" />}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function SearchTrigger() {
  const { open } = usePalette();
  return (
    <button type="button" onClick={open} className="flex h-9 w-full max-w-sm items-center gap-2.5 rounded-lg border border-line/70 bg-canvas/50 px-3 text-sm text-faint transition-colors hover:border-line hover:text-mist">
      <Search className="size-4" aria-hidden />
      <span className="flex-1 text-left">Search or jump to…</span>
      <span className="hidden gap-1 sm:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
    </button>
  );
}

export function AppLayout() {
  const { me } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable; preference is not persisted */ }
  }, [collapsed]);

  const signOut = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      qc.clear();
      qc.setQueryData(ME_KEY, null);
      navigate('/login');
    }
  };

  return (
    <CommandPaletteProvider onSignOut={signOut}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brass focus:px-3 focus:py-2 focus:text-canvas">Skip to content</a>
      <div className="flex min-h-screen">
        <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line/60 bg-surface/50 transition-[width] duration-200 lg:flex', collapsed ? 'w-[4.25rem]' : 'w-64')}>
          <div className={cn('flex h-16 items-center px-5', collapsed && 'justify-center px-0')}>
            {collapsed ? <LogoMark /> : <Logo />}
          </div>
          <div className="px-3"><OrgMenu collapsed={collapsed} /></div>
          <SidebarNav collapsed={collapsed} />
          <div className="border-t border-line/60 p-3">
            <Button variant="ghost" size="sm" className={cn('w-full justify-start text-faint', collapsed && 'justify-center')} onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {collapsed ? <PanelLeftOpen /> : <><PanelLeftClose />Collapse</>}
            </Button>
          </div>
        </aside>

        <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-40 bg-black/60 lg:hidden" />
            <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface lg:hidden">
              <D.Title className="sr-only">Navigation</D.Title>
              <D.Description className="sr-only">Main navigation</D.Description>
              <div className="flex h-16 items-center px-5"><Logo /></div>
              <div className="px-3"><OrgMenu collapsed={false} /></div>
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </D.Content>
          </D.Portal>
        </D.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line/60 px-4 sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><MenuIcon /></Button>
            <SearchTrigger />
            <div className="ml-auto flex items-center gap-1">
              <NotificationsButton />
              <Menu>
                <MenuTrigger asChild>
                  <button type="button" className="ml-1 rounded-full" aria-label="Account menu">
                    {me ? <Avatar name={me.user.name} className="size-8" /> : <Skeleton className="size-8 rounded-full" />}
                  </button>
                </MenuTrigger>
                <MenuContent>
                  {me && (
                    <div className="px-2.5 py-2">
                      <p className="text-sm font-medium">{me.user.name}</p>
                      <p className="text-xs text-faint">{me.user.email}</p>
                    </div>
                  )}
                  <MenuSeparator />
                  <MenuItem onSelect={() => navigate('/app/settings')}><Settings />Settings</MenuItem>
                  <MenuItem onSelect={signOut}><LogOut />Sign out</MenuItem>
                </MenuContent>
              </Menu>
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {/* Enter-only transition: an exit phase would keep a second copy of the new page
                mounted briefly, and clicks during that window would be lost on remount. */}
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}>
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </main>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading page">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <Skeleton className="mt-6 h-72 w-full" />
    </div>
  );
}
