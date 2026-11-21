import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '../enums';
import { optionalText, paginationQuery } from './common';

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: optionalText(5000),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  dueAt: z.coerce.date().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
});
export type TaskInput = z.input<typeof taskInputSchema>;

export const taskUpdateSchema = taskInputSchema.partial().extend({
  position: z.number().finite().optional(),
});
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;

export const taskListQuery = paginationQuery.extend({
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.union([z.string().uuid(), z.literal('me'), z.literal('unassigned')]).optional(),
  overdue: z.coerce.boolean().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type TaskListQuery = z.infer<typeof taskListQuery>;
