export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'FULFILLED', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_KINDS = ['PAYMENT', 'REFUND'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MOVEMENT_TYPES = ['INITIAL', 'RESTOCK', 'ADJUSTMENT', 'RESERVE', 'RELEASE', 'FULFILL'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const NOTIFICATION_TYPES = ['LOW_STOCK', 'TASK_ASSIGNED', 'ORDER_STATUS', 'PAYMENT_RECORDED'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
