import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { applyServerErrors } from './forms';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('applyServerErrors', () => {
  it('maps server validation errors onto known form fields', () => {
    const setError = vi.fn();
    const err = new ApiError(400, { code: 'VALIDATION_ERROR', message: 'Some fields are invalid', details: { fields: { email: ['Enter a valid email'] } } });
    applyServerErrors(err, setError, ['email', 'name']);
    expect(setError).toHaveBeenCalledWith('email', { message: 'Enter a valid email' });
  });

  it('puts duplicate-value conflicts on the offending field', () => {
    const setError = vi.fn();
    const err = new ApiError(409, { code: 'DUPLICATE', message: 'A record with this sku already exists', details: { fields: ['sku'] as unknown as Record<string, string[]> } });
    applyServerErrors(err, setError, ['sku', 'name']);
    expect(setError).toHaveBeenCalledWith('sku', { message: 'A record with this sku already exists' });
  });

  it('falls back to a toast for errors it cannot place', async () => {
    const { toast } = await import('sonner');
    const setError = vi.fn();
    applyServerErrors(new ApiError(422, { code: 'INSUFFICIENT_STOCK', message: 'Not enough stock' }), setError, ['email']);
    expect(setError).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Not enough stock');
  });
});
