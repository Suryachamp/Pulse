import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';
import { formatMoney } from '@pulse/shared';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const money = (cents: number, opts?: { compact?: boolean }) => formatMoney(cents, 'USD', opts);

export const number = (n: number) => new Intl.NumberFormat('en-US').format(n);

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export const date = (d: string | Date) => format(new Date(d), 'MMM d, yyyy');
/** Omits the year when it's the current one. */
export const shortDate = (d: string | Date) => {
  const v = new Date(d);
  return format(v, v.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy');
};
export const dateTime = (d: string | Date) => format(new Date(d), 'MMM d, yyyy · h:mm a');
export const ago = (d: string | Date) => formatDistanceToNowStrict(new Date(d), { addSuffix: true });

export function friendlyDay(d: string | Date) {
  const v = new Date(d);
  if (isToday(v)) return `Today, ${format(v, 'h:mm a')}`;
  if (isYesterday(v)) return `Yesterday, ${format(v, 'h:mm a')}`;
  return format(v, 'MMM d, h:mm a');
}

export const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** Stable client key so a retried "record payment" can never create a duplicate. */
export const idempotencyKey = () => `web-${crypto.randomUUID()}`;
