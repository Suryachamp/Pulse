export function formatMoney(cents: number, currency = 'USD', opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    notation: opts.compact ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact ? 1 : 2,
  }).format(cents / 100);
}

/** Parses a user-entered decimal amount ("12.5") into integer cents without float drift. */
export function toCents(value: string | number): number {
  const s = typeof value === 'number' ? value.toFixed(2) : value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  const negative = s.startsWith('-');
  const [whole = '0', frac = ''] = s.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return negative ? -cents : cents;
}
