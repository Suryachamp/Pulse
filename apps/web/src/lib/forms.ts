import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, errorMessage } from './api';

/** Maps server-side validation errors back onto form fields; falls back to a toast. */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, fields: readonly Path<T>[]) {
  if (err instanceof ApiError) {
    let mapped = false;
    for (const [key, messages] of Object.entries(err.fieldErrors)) {
      if (messages?.[0] && (fields as readonly string[]).includes(key)) {
        setError(key as Path<T>, { message: messages[0] });
        mapped = true;
      }
    }
    if (err.body.code === 'DUPLICATE') {
      const field = (err.body.details?.fields as string[] | undefined)?.find((f) => (fields as readonly string[]).includes(f));
      if (field) {
        setError(field as Path<T>, { message: err.message });
        return;
      }
    }
    if (mapped) return;
  }
  toast.error(errorMessage(err));
}
