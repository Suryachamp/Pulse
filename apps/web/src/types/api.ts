import type { InvoiceStatus, MovementType, NotificationType, OrderStatus, PaymentKind, PaymentMethod, PaymentStatus, Permission, Role, TaskPriority, TaskStatus } from '@pulse/shared';

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Me {
  user: { id: string; email: string; name: string };
  organizations: { id: string; name: string; slug: string; role: Role }[];
  organization: (InvoiceSettings & { id: string; name: string; slug: string; currency: string; defaultLowStockThreshold: number; defaultTaxRateBps: number }) | null;
  role: Role | null;
  permissions: Permission[];
}

export interface InvoiceSettings {
  invoiceAddress: string | null;
  invoiceEmail: string | null;
  invoicePhone: string | null;
  invoiceTaxId: string | null;
  invoiceFooter: string | null;
  paymentTermsDays: number;
}

export interface PersonRef { id: string; name: string }

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: string[];
  archivedAt: string | null;
  createdAt: string;
  orderCount: number;
  totalSpentCents: number;
  outstandingCents: number;
  lastOrderAt: string | null;
}

export interface TimelineEntry { id: string; action: string; summary: string; createdAt: string; entityType: string; entityId: string; actor: PersonRef | null }

export interface CustomerDetail extends Omit<CustomerRow, 'orderCount' | 'totalSpentCents' | 'outstandingCents' | 'lastOrderAt'> {
  address: string | null;
  notes: string | null;
  stats: { orderCount: number; totalSpentCents: number; collectedCents: number; outstandingCents: number; averageOrderCents: number; lastOrderAt: string | null };
  orders: { id: string; number: number; status: OrderStatus; totalCents: number; paidCents: number; refundedCents: number; createdAt: string; _count: { items: number } }[];
  timeline: TimelineEntry[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  priceCents: number;
  costCents: number | null;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface Movement {
  id: string;
  type: MovementType;
  onHandDelta: number;
  reservedDelta: number;
  onHandAfter: number;
  reservedAfter: number;
  reason: string | null;
  createdAt: string;
  actor: PersonRef | null;
  order: { id: string; number: number } | null;
}

export interface ProductDetail extends Product { movements: Movement[]; unitsSold: number; revenueCents: number }

export interface OrderRow {
  id: string;
  number: number;
  status: OrderStatus;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  paymentStatus: PaymentStatus;
  outstandingCents: number;
  createdAt: string;
  customer: { id: string; name: string; company: string | null };
  _count: { items: number };
}

export interface Payment {
  id: string;
  kind: PaymentKind;
  method: PaymentMethod;
  amountCents: number;
  reference: string | null;
  note: string | null;
  receivedAt: string;
  recordedBy: PersonRef | null;
}

export interface OrderDetail extends Omit<OrderRow, '_count' | 'customer'> {
  customer: { id: string; name: string; email: string | null; company: string | null; phone: string | null };
  createdBy: PersonRef | null;
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  notes: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  items: { id: string; productId: string; productName: string; sku: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[];
  payments: Payment[];
  allowedTransitions: OrderStatus[];
  history: Omit<TimelineEntry, 'entityType' | 'entityId'>[];
}

export interface PaymentRow extends Payment { order: { id: string; number: number; customer: PersonRef } }

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  position: number;
  isOverdue: boolean;
  completedAt: string | null;
  createdAt: string;
  assignee: PersonRef | null;
  createdBy: PersonRef | null;
  customer: PersonRef | null;
  order: { id: string; number: number } | null;
}

export interface TaskSummary { total: number; done: number; open: number; overdue: number; dueSoon: number; byStatus: Record<string, number> }

export interface Member { id: string; role: Role; joinedAt: string; user: { id: string; name: string; email: string } }

export interface Notification { id: string; type: NotificationType; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

export interface ActivityEntry extends TimelineEntry { metadata?: Record<string, unknown>; ip?: string | null }

export interface PeriodMetrics {
  orderCount: number;
  bookedSalesCents: number;
  averageOrderCents: number;
  collectedCents: number;
  refundedCents: number;
  netRevenueCents: number;
  paymentCount: number;
  cancelledCount: number;
}

export interface Summary {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  current: PeriodMetrics;
  previous: PeriodMetrics;
  outstandingCents: number;
  ordersWithBalance: number;
}

export interface SeriesPoint { bucket: string; booked: number; collected: number; refunded: number; net: number; orders: number }
export interface Series { unit: 'day' | 'week'; points: SeriesPoint[] }

export interface Breakdown {
  ordersByStatus: { status: OrderStatus; count: number; totalCents: number }[];
  topProducts: { productId: string; name: string; sku: string; units: number; revenueCents: number; available: number }[];
  inventory: { products: number; units: number; reserved: number; costValue: number; retailValue: number; low: number; out: number };
  aging: { bucket: string; cents: number; orders: number }[];
  methods: { method: PaymentMethod; cents: number; count: number }[];
}

export interface Alert { id: string; severity: 'critical' | 'warning' | 'info'; title: string; description: string; href: string }

export interface Dashboard {
  range: { from: string; to: string };
  money: { summary: Summary; series: Series } | null;
  lowStock: Product[];
  lowStockCount: number;
  tasks: TaskSummary;
  activity: TimelineEntry[];
  alerts: Alert[];
  onboarding: { id: string; label: string; done: boolean; href: string }[];
}

export interface Invoice {
  id: string;
  number: number;
  orderStatus: OrderStatus;
  invoiceStatus: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  paymentTermsDays: number;
  cancelledAt: string | null;
  currency: string;
  seller: { name: string; address: string | null; email: string | null; phone: string | null; taxId: string | null; footer: string | null };
  customer: { name: string; company: string | null; email: string | null; phone: string | null; address: string | null };
  items: { id: string; productName: string; sku: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[];
  subtotalCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  balanceDueCents: number;
  payments: { id: string; kind: PaymentKind; method: PaymentMethod; amountCents: number; reference: string | null; receivedAt: string }[];
}
