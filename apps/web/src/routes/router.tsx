import { lazy } from 'react';
import { createBrowserRouter, Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { AppLayout } from '@/layouts/app-layout';
import { EmptyState } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { GuestOnly, RequireAuth, RequirePermission } from './guards';

const Landing = lazy(() => import('@/features/landing/landing-page'));
const Login = lazy(() => import('@/features/auth/login-page'));
const Register = lazy(() => import('@/features/auth/register-page'));
const Dashboard = lazy(() => import('@/features/dashboard/dashboard-page'));
const Customers = lazy(() => import('@/features/customers/customers-page'));
const CustomerDetail = lazy(() => import('@/features/customers/customer-detail-page'));
const Orders = lazy(() => import('@/features/orders/orders-page'));
const OrderDetail = lazy(() => import('@/features/orders/order-detail-page'));
const OrderEditor = lazy(() => import('@/features/orders/order-editor-page'));
const Invoice = lazy(() => import('@/features/invoices/invoice-page'));
const Inventory = lazy(() => import('@/features/inventory/inventory-page'));
const ProductDetail = lazy(() => import('@/features/inventory/product-detail-page'));
const Tasks = lazy(() => import('@/features/tasks/tasks-page'));
const Payments = lazy(() => import('@/features/payments/payments-page'));
const Analytics = lazy(() => import('@/features/analytics/analytics-page'));
const ActivityPage = lazy(() => import('@/features/activity/activity-page'));
const Team = lazy(() => import('@/features/team/team-page'));
const SettingsPage = lazy(() => import('@/features/settings/settings-page'));

function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <EmptyState icon={Compass} title="This page doesn’t exist" description="The link may be old, or the record may have been removed." action={<Button asChild variant="primary"><Link to="/app">Go to dashboard</Link></Button>} />
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/login', element: <GuestOnly><Login /></GuestOnly> },
  { path: '/register', element: <GuestOnly><Register /></GuestOnly> },
  // Full-page document, outside the app shell so it prints cleanly.
  { path: '/app/orders/:id/invoice', element: <RequireAuth><Invoice /></RequireAuth> },
  {
    path: '/app',
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'customers', element: <Customers /> },
      { path: 'customers/:id', element: <CustomerDetail /> },
      { path: 'orders', element: <Orders /> },
      { path: 'orders/new', element: <OrderEditor /> },
      { path: 'orders/:id', element: <OrderDetail /> },
      { path: 'orders/:id/edit', element: <OrderEditor /> },
      { path: 'inventory', element: <Inventory /> },
      { path: 'inventory/:id', element: <ProductDetail /> },
      { path: 'tasks', element: <Tasks /> },
      { path: 'payments', element: <Payments /> },
      { path: 'analytics', element: <RequirePermission permission="analytics:read"><Analytics /></RequirePermission> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'team', element: <Team /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]);
