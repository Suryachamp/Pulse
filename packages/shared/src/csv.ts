export type CsvCell = string | number | boolean | Date | null | undefined;

const NUMERIC = /^-?\d+(\.\d+)?$/;
// Cells starting with these are run as formulas by Excel, Sheets and LibreOffice.
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return String(value);
  // Prefixing with an apostrophe makes spreadsheets show the text instead of evaluating it.
  const text = FORMULA_START.test(value) && !NUMERIC.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV (CRLF line endings) that is safe to open in a spreadsheet. */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Integer cents as a plain decimal string ("1234.56"), with no currency symbol or grouping. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
