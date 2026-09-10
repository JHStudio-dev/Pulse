import type { ClassMarkerId, ClassSessionId, UserId } from './ids';
import type { Instant } from './primitives';

/**
 * Markers placed during a class.
 *
 * `missed` is the one that matters most: it turns "me perdí" into a concrete
 * point to review later, rather than a feeling the student has to reconstruct
 * from memory.
 */
export type ClassMarkerKind = 'note' | 'question' | 'important' | 'task' | 'missed';

export interface ClassMarker {
  id: ClassMarkerId;
  userId: UserId;
  classSessionId: ClassSessionId;
  kind: ClassMarkerKind;
  note: string | null;
  /** Seconds from the start of the session, not a wall clock time. */
  offsetSeconds: number;
  createdAt: Instant;
}
