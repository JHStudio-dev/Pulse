/**
 * Branded identifiers.
 *
 * Every entity id is a UUID string at runtime. Branding them separately stops a
 * subject id being passed where a session id is expected, which the compiler
 * cannot catch when everything is `string`.
 */

declare const brand: unique symbol;

type Branded<T, B extends string> = T & { readonly [brand]: B };

export type UserId = Branded<string, 'UserId'>;
export type UniversityId = Branded<string, 'UniversityId'>;
export type CampusInstanceId = Branded<string, 'CampusInstanceId'>;
export type CampusConnectionId = Branded<string, 'CampusConnectionId'>;
export type AcademicPeriodId = Branded<string, 'AcademicPeriodId'>;
export type SubjectId = Branded<string, 'SubjectId'>;
export type SubjectScheduleId = Branded<string, 'SubjectScheduleId'>;
export type ClassSessionId = Branded<string, 'ClassSessionId'>;
export type AttendanceId = Branded<string, 'AttendanceId'>;
export type TaskId = Branded<string, 'TaskId'>;
export type TaskItemId = Branded<string, 'TaskItemId'>;
export type AssessmentId = Branded<string, 'AssessmentId'>;
export type GradeCategoryId = Branded<string, 'GradeCategoryId'>;
export type GradeId = Branded<string, 'GradeId'>;
export type DocumentId = Branded<string, 'DocumentId'>;
export type NoteId = Branded<string, 'NoteId'>;
export type InboxItemId = Branded<string, 'InboxItemId'>;
export type RecoveryPlanId = Branded<string, 'RecoveryPlanId'>;
export type RecoveryItemId = Branded<string, 'RecoveryItemId'>;
export type ReminderId = Branded<string, 'ReminderId'>;
export type NotificationId = Branded<string, 'NotificationId'>;

/** Widens any branded id back to a plain string for storage or logging. */
export function idToString(id: Branded<string, string>): string {
  return id;
}
