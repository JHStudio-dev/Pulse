import { z } from 'zod';
import {
  dateRangeSchema,
  httpUrlSchema,
  isoDateSchema,
  optionalShortText,
  shortText,
  timeOfDaySchema,
  timeZoneSchema,
  uuidSchema,
  weekdaySchema,
} from './primitives.js';

export const modalitySchema = z.enum(['in_person', 'virtual', 'hybrid', 'unconfirmed']);

export const locationSchema = z.object({
  campus: optionalShortText(120),
  building: optionalShortText(120),
  room: optionalShortText(60),
});

export const createAcademicPeriodSchema = z.object({
  name: shortText(120),
  range: dateRangeSchema,
  timeZone: timeZoneSchema,
});

export const createSubjectSchema = z.object({
  academicPeriodId: uuidSchema,
  campusInstanceId: uuidSchema.nullable().default(null),
  name: shortText(160),
  code: optionalShortText(40),
  professorName: optionalShortText(160),
  professorContact: optionalShortText(200),
  passingGrade: z.number().min(0).nullable().default(null),
  gradeScaleMax: z.number().positive().default(100),
  defaultModality: modalitySchema.default('unconfirmed'),
  defaultMeetingUrl: httpUrlSchema.nullable().default(null),
  defaultLocation: locationSchema,
  travelBufferMinutes: z.number().int().min(0).max(600).nullable().default(null),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
});

export const updateSubjectSchema = createSubjectSchema.partial();

/**
 * A schedule slot carries its own times so the range check stays on the object
 * that owns both fields.
 */
export const createSubjectScheduleSchema = z
  .object({
    subjectId: uuidSchema,
    weekday: weekdaySchema,
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    modality: modalitySchema,
    meetingUrl: httpUrlSchema.nullable().default(null),
    location: locationSchema,
    activeRange: dateRangeSchema.nullable().default(null),
  })
  .refine((slot) => slot.startTime < slot.endTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export const classSessionStatusSchema = z.enum(['scheduled', 'completed', 'cancelled']);

export const createClassSessionSchema = z
  .object({
    subjectId: uuidSchema,
    subjectScheduleId: uuidSchema.nullable().default(null),
    date: isoDateSchema,
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    modality: modalitySchema,
    status: classSessionStatusSchema.default('scheduled'),
    meetingUrl: httpUrlSchema.nullable().default(null),
    location: locationSchema,
    changeNote: optionalShortText(300),
    cancelledReason: optionalShortText(300),
  })
  .refine((session) => session.startTime < session.endTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

export const updateClassSessionSchema = z.object({
  date: isoDateSchema.optional(),
  startTime: timeOfDaySchema.optional(),
  endTime: timeOfDaySchema.optional(),
  modality: modalitySchema.optional(),
  status: classSessionStatusSchema.optional(),
  meetingUrl: httpUrlSchema.nullable().optional(),
  location: locationSchema.optional(),
  changeNote: optionalShortText(300).optional(),
  cancelledReason: optionalShortText(300).optional(),
});

export const attendanceStatusSchema = z.enum(['attended', 'partial', 'missed', 'cancelled']);

export const recordAttendanceSchema = z.object({
  classSessionId: uuidSchema,
  status: attendanceStatusSchema,
  note: optionalShortText(300),
});

export type CreateAcademicPeriodInput = z.infer<typeof createAcademicPeriodSchema>;
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type CreateSubjectScheduleInput = z.infer<typeof createSubjectScheduleSchema>;
export type CreateClassSessionInput = z.infer<typeof createClassSessionSchema>;
export type UpdateClassSessionInput = z.infer<typeof updateClassSessionSchema>;
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;
