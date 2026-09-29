import { z } from 'zod';
import { modalitySchema, locationSchema } from './academic';
import { httpUrlSchema, shortText, timeOfDaySchema, weekdaySchema } from './primitives';

const externalIdSchema = z.string().trim().min(1).max(240);
const looseTimestampSchema = z.string().trim().min(1).max(80);

export const campusSyncCourseSnapshotSchema = z.object({
  externalId: externalIdSchema,
  sessionId: z.string().trim().max(120).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  code: z.string().trim().min(1).max(120).optional(),
  section: z.string().trim().min(1).max(120).optional(),
  teacher: z.string().trim().min(1).max(300).optional(),
  sourceUrl: httpUrlSchema.optional(),
  scheduleHints: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  meetingUrls: z.array(httpUrlSchema).max(10).optional(),
});

export const campusSyncDocumentSnapshotSchema = z.object({
  externalId: externalIdSchema,
  courseExternalId: externalIdSchema,
  name: shortText(500),
  kind: z.enum(['file', 'folder']),
  path: z.string().max(2_000).optional(),
  size: z.string().max(80).optional(),
  updatedAt: looseTimestampSchema.optional(),
  sourceUrl: httpUrlSchema,
});

export const campusSyncAssignmentSnapshotSchema = z.object({
  externalId: externalIdSchema,
  courseExternalId: externalIdSchema,
  title: shortText(500),
  description: z.string().max(100_000).optional(),
  dueAt: looseTimestampSchema.optional(),
  sourceUrl: httpUrlSchema,
  submissionUrl: httpUrlSchema.optional(),
  hasSubmission: z.boolean().optional(),
});

export const campusSyncAnnouncementSnapshotSchema = z.object({
  externalId: externalIdSchema,
  courseExternalId: externalIdSchema,
  title: shortText(500),
  author: z.string().trim().max(300).optional(),
  content: z.string().max(150_000).optional(),
  updatedAt: looseTimestampSchema.optional(),
  sourceUrl: httpUrlSchema,
});

export const campusSyncEventSnapshotSchema = z.object({
  externalId: externalIdSchema.optional(),
  courseExternalId: externalIdSchema,
  title: shortText(500),
  description: z.string().max(100_000).optional(),
  startsAt: looseTimestampSchema,
  endsAt: looseTimestampSchema.optional(),
  allDay: z.boolean(),
  sourceType: z.enum(['agenda', 'assignment']),
  sourceExternalId: externalIdSchema.optional(),
  sourceUrl: httpUrlSchema.optional(),
});

export const campusSyncSnapshotSchema = z.object({
  course: campusSyncCourseSnapshotSchema,
  documents: z.array(campusSyncDocumentSnapshotSchema).max(1_000),
  assignments: z.array(campusSyncAssignmentSnapshotSchema).max(500),
  announcements: z.array(campusSyncAnnouncementSnapshotSchema).max(500),
  events: z.array(campusSyncEventSnapshotSchema).max(2_000),
});

export type CampusSyncSnapshotInput = z.infer<typeof campusSyncSnapshotSchema>;

export const campusSyncConfirmedScheduleSchema = z
  .object({
    weekdays: z.array(weekdaySchema).min(1).max(7),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    modality: modalitySchema,
    meetingUrl: httpUrlSchema.nullable().default(null),
    location: locationSchema.default({
      campus: null,
      building: null,
      room: null,
    }),
  })
  .refine((schedule) => schedule.startTime < schedule.endTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export const campusSyncIngestRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('link'),
    subjectId: z.uuid(),
    snapshot: campusSyncSnapshotSchema,
    schedule: campusSyncConfirmedScheduleSchema.optional(),
  }),
  z.object({
    mode: z.literal('create'),
    snapshot: campusSyncSnapshotSchema,
    schedule: campusSyncConfirmedScheduleSchema.optional(),
  }),
]);

export type CampusSyncIngestRequest = z.infer<typeof campusSyncIngestRequestSchema>;
