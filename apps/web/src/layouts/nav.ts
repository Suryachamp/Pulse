import { Activity, BarChart3, Boxes, CreditCard, LayoutDashboard, ListChecks, Settings, ShoppingBag, Users, UsersRound, type LucideIcon } from 'lucide-react';
import type { Permission } from '@pulse/shared';

export interface NavItem { to: string; label: string; icon: LucideIcon; permission?: Permission; shortcut?: string }

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operate',
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'G D' },
      { to: '/app/orders', label: 'Orders', icon: ShoppingBag, shortcut: 'G O' },
      { to: '/app/customers', label: 'Customers', icon: Users, shortcut: 'G C' },
      { to: '/app/inventory', label: 'Inventory', icon: Boxes, shortcut: 'G I' },
      { to: '/app/tasks', label: 'Tasks', icon: ListChecks, shortcut: 'G T' },
      { to: '/app/payments', label: 'Payments', icon: CreditCard, shortcut: 'G P' },
    ],
  },
  {
    label: 'Understand',
    items: [
      { to: '/app/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics:read', shortcut: 'G A' },
      { to: '/app/activity', label: 'Activity', icon: Activity, permission: 'activity:read' },
    ],
  },
  {
    label: 'Organization',
    items: [
      { to: '/app/team', label: 'Team', icon: UsersRound, permission: 'members:read' },
      { to: '/app/settings', label: 'Settings', icon: Settings },
    ],
  },
];
