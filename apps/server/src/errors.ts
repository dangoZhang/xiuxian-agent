import type { ErrorCode } from '@xiuxian/protocol';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorBody(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) };
  }
  return { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Unknown server error' };
}

export function statusOf(error: unknown): number {
  return error instanceof AppError ? error.status : 500;
}
