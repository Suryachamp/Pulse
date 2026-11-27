import { describe, expect, it } from 'vitest';
import { centsToDecimal, toCsv } from './csv';

describe('csv', () => {
  it('writes a header and rows with CRLF line endings', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, null]])).toBe('a,b\r\n1,x\r\n2,\r\n');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv(['v'], [['a,b'], ['say "hi"'], ['line1\nline2']])).toBe('v\r\n"a,b"\r\n"say ""hi"""\r\n"line1\nline2"\r\n');
  });

  it('neutralises spreadsheet formulas in text cells', () => {
    const csv = toCsv(['v'], [['=HYPERLINK("http://x")'], ['+1+1'], ['-2+3'], ['@SUM(A1)'], ['\tcmd'], ['safe']]);
    expect(csv.split('\r\n').slice(1, -1)).toEqual([`"'=HYPERLINK(""http://x"")"`, "'+1+1", "'-2+3", "'@SUM(A1)", "'\tcmd", 'safe']);
  });

  it('keeps plain numeric text, including negatives, as numbers', () => {
    expect(toCsv(['v'], [['-2.50'], ['42']])).toBe('v\r\n-2.50\r\n42\r\n');
  });

  it('leaves numbers, booleans and dates as values', () => {
    expect(toCsv(['n', 'b', 'd'], [[-5, true, new Date('2026-01-02T03:04:05Z')]])).toBe('n,b,d\r\n-5,true,2026-01-02T03:04:05.000Z\r\n');
  });

  it('formats cents as plain decimals without float drift', () => {
    expect(centsToDecimal(0)).toBe('0.00');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(123456)).toBe('1234.56');
    expect(centsToDecimal(-250)).toBe('-2.50');
  });
});
