import { z } from 'zod';
import { httpUrlSchema, shortText } from './primitives';

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

export const campusSyncIngestRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('link'),
    subjectId: z.uuid(),
    snapshot: campusSyncSnapshotSchema,
  }),
  z.object({
    mode: z.literal('create'),
    snapshot: campusSyncSnapshotSchema,
  }),
]);

export type CampusSyncIngestRequest = z.infer<typeof campusSyncIngestRequestSchema>;
