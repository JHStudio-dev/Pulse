import type {
  AssessmentId,
  ClassSessionId,
  NotificationId,
  ReminderId,
  TaskId,
  UserId,
} from './ids.js';
import type { Instant, TimeOfDay } from './primitives.js';

export type ReminderTargetKind = 'class_session' | 'task' | 'assessment';

/** What a reminder points at. Exactly one target is set. */
export interface ReminderTarget {
  kind: ReminderTargetKind;
  classSessionId: ClassSessionId | null;
  taskId: TaskId | null;
  assessmentId: AssessmentId | null;
}

/**
 * `departure` exists separately from `start` because an in-person class needs a
 * leave-now reminder offset by travel time, not just a class-starting one.
 */
export type ReminderKind = 'lead_time' | 'departure' | 'start';

export interface Reminder {
  id: ReminderId;
  userId: UserId;
  target: ReminderTarget;
  kind: ReminderKind;
  /** Minutes before the target instant. */
  offsetMinutes: number;
  enabled: boolean;
  createdAt: Instant;
}

export type NotificationStatus = 'scheduled' | 'sent' | 'read' | 'dismissed' | 'suppressed';

export interface Notification {
  id: NotificationId;
  userId: UserId;
  reminderId: ReminderId | null;
  title: string;
  body: string | null;
  scheduledFor: Instant;
  status: NotificationStatus;
  sentAt: Instant | null;
  readAt: Instant | null;
}

/** Silent window. Crosses midnight when `start` is later than `end`. */
export interface QuietHours {
  enabled: boolean;
  start: TimeOfDay;
  end: TimeOfDay;
}
