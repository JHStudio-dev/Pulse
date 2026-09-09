import { DatabaseError } from '../ports/errors';

/** Turns a PostgREST error into a domain error, so callers never see the driver. */
export function translateError(error: { code?: string; message: string }): DatabaseError {
  // PostgREST reports an RLS denial as an empty result or a 42501 code.
  if (error.code === '42501') {
    return new DatabaseError('permission_denied', error.message, error);
  }
  if (error.code === '23505') {
    return new DatabaseError('conflict', error.message, error);
  }
  return new DatabaseError('unavailable', error.message, error);
}
