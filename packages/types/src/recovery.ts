import type { ClassSessionId, RecoveryItemId, RecoveryPlanId, UserId } from './ids.js';
import type { Instant } from './primitives.js';

/**
 * Recovery.
 *
 * A missed class becomes a plan instead of disappearing from the interface.
 */

export type RecoveryStatus = 'pending' | 'recovering' | 'recovered';

export interface RecoveryPlan {
  id: RecoveryPlanId;
  userId: UserId;
  classSessionId: ClassSessionId;
  status: RecoveryStatus;
  createdAt: Instant;
  completedAt: Instant | null;
}

export type RecoveryItemKind =
  | 'review_material'
  | 'get_notes'
  | 'confirm_topics'
  | 'check_new_dates'
  | 'practice'
  | 'ask_question';

export interface RecoveryItem {
  id: RecoveryItemId;
  recoveryPlanId: RecoveryPlanId;
  kind: RecoveryItemKind;
  label: string;
  done: boolean;
  position: number;
}
