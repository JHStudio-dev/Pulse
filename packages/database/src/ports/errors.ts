/** Storage failures surface as these, so callers never handle driver errors. */

export type DatabaseErrorCode = 'not_found' | 'conflict' | 'permission_denied' | 'unavailable';

export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;
  override readonly cause?: unknown;

  constructor(code: DatabaseErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}
