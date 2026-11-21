import { describe, expect, it } from 'vitest';
import { stockLabel } from './stock-meter';

describe('stockLabel', () => {
  it('classifies availability against the threshold', () => {
    expect(stockLabel(0, 5).text).toBe('Out of stock');
    expect(stockLabel(-1, 5).text).toBe('Out of stock');
    expect(stockLabel(5, 5).text).toBe('Low');
    expect(stockLabel(6, 5).text).toBe('In stock');
  });
});
