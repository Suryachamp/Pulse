export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please sign in to continue') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do that') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (entity = 'Resource') => new AppError(404, 'NOT_FOUND', `${entity} not found`);
export const conflict = (message: string, details?: Record<string, unknown>) => new AppError(409, 'CONFLICT', message, details);
export const unprocessable = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(422, code, message, details);
