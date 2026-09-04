import type {
  Attendance,
  ClassSession,
  ClassSessionId,
  RecoveryItemKind,
  RecoveryPlan,
  RecoveryStatus,
} from '@pulse/types';

/**
 * Recovery planning.
 *
 * A missed class turns into concrete steps instead of vanishing from the
 * interface. Wording stays out of here: drafts carry item kinds, and the
 * interface renders them.
 */

export interface RecoveryItemDraft {
  kind: RecoveryItemKind;
  position: number;
}

export interface RecoveryPlanDraft {
  classSessionId: ClassSessionId;
  items: RecoveryItemDraft[];
}

/** Steps that apply to any missed class, in the order they make sense. */
const BASE_ITEMS: readonly RecoveryItemKind[] = [
  'review_material',
  'get_notes',
  'confirm_topics',
  'check_new_dates',
];

/** A fully missed class also needs practice and a place to log questions. */
const FULL_ABSENCE_ITEMS: readonly RecoveryItemKind[] = ['practice', 'ask_question'];

/**
 * A cancelled class has nothing to recover, and a class the student attended in
 * full does not need a plan.
 */
export function needsRecovery(attendance: Attendance | null): boolean {
  if (!attendance) return false;
  return attendance.status === 'missed' || attendance.status === 'partial';
}

export function buildRecoveryPlan(
  session: ClassSession,
  attendance: Attendance | null,
): RecoveryPlanDraft | null {
  if (!needsRecovery(attendance)) return null;
  if (session.status === 'cancelled') return null;

  const kinds =
    attendance?.status === 'missed' ? [...BASE_ITEMS, ...FULL_ABSENCE_ITEMS] : [...BASE_ITEMS];

  return {
    classSessionId: session.id,
    items: kinds.map((kind, index) => ({ kind, position: index })),
  };
}

/** Derives plan status from its items so the two cannot drift apart. */
export function deriveRecoveryStatus(items: readonly { done: boolean }[]): RecoveryStatus {
  if (items.length === 0) return 'pending';
  if (items.every((item) => item.done)) return 'recovered';
  if (items.some((item) => item.done)) return 'recovering';
  return 'pending';
}

export function countUnrecovered(plans: readonly RecoveryPlan[]): number {
  return plans.filter((plan) => plan.status !== 'recovered').length;
}
