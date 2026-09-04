import { z } from 'zod';
import {
  isoDateSchema,
  longText,
  optionalShortText,
  shortText,
  timeOfDaySchema,
  uuidSchema,
} from './primitives.js';

export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'done',
  'submitted',
  'overdue',
]);

export const taskDifficultySchema = z.enum(['easy', 'medium', 'hard']);

export const createTaskSchema = z
  .object({
    subjectId: uuidSchema.nullable().default(null),
    title: shortText(200),
    description: longText(5_000).nullable().default(null),
    assignedDate: isoDateSchema.nullable().default(null),
    dueDate: isoDateSchema.nullable().default(null),
    dueTime: timeOfDaySchema.nullable().default(null),
    status: taskStatusSchema.default('pending'),
    difficulty: taskDifficultySchema.nullable().default(null),
    progress: z.number().int().min(0).max(100).default(0),
    estimatedMinutes: z.number().int().positive().max(10_000).nullable().default(null),
    academicWeight: z.number().min(0).max(100).nullable().default(null),
  })
  .refine(
    (task) => task.assignedDate === null || task.dueDate === null || task.assignedDate <= task.dueDate,
    { message: 'Due date must not precede the assigned date', path: ['dueDate'] },
  )
  .refine((task) => task.dueTime === null || task.dueDate !== null, {
    message: 'A due time needs a due date',
    path: ['dueTime'],
  });

export const updateTaskSchema = z.object({
  subjectId: uuidSchema.nullable().optional(),
  title: shortText(200).optional(),
  description: longText(5_000).nullable().optional(),
  assignedDate: isoDateSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  dueTime: timeOfDaySchema.nullable().optional(),
  status: taskStatusSchema.optional(),
  difficulty: taskDifficultySchema.nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  estimatedMinutes: z.number().int().positive().max(10_000).nullable().optional(),
  academicWeight: z.number().min(0).max(100).nullable().optional(),
});

export const createTaskItemSchema = z.object({
  taskId: uuidSchema,
  title: shortText(200),
  done: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
});

export const assessmentTypeSchema = z.enum([
  'exam',
  'midterm',
  'quiz',
  'project',
  'presentation',
  'lab',
  'graded_task',
  'final',
]);

export const createAssessmentSchema = z.object({
  subjectId: uuidSchema,
  gradeCategoryId: uuidSchema.nullable().default(null),
  classSessionId: uuidSchema.nullable().default(null),
  title: shortText(200),
  type: assessmentTypeSchema,
  date: isoDateSchema.nullable().default(null),
  maxPoints: z.number().positive().nullable().default(null),
});

export const createGradeCategorySchema = z.object({
  subjectId: uuidSchema,
  name: shortText(120),
  weight: z.number().min(0).max(100),
});

export const recordGradeSchema = z
  .object({
    assessmentId: uuidSchema,
    pointsEarned: z.number().min(0),
    pointsPossible: z.number().positive(),
  })
  .refine((grade) => grade.pointsEarned <= grade.pointsPossible, {
    message: 'Earned points cannot exceed possible points',
    path: ['pointsEarned'],
  });

export const createInboxItemSchema = z.object({
  rawText: shortText(500),
});

export const noteMarkerSchema = z.enum(['question', 'important', 'exam', 'task', 'missed']);

export const createNoteSchema = z.object({
  subjectId: uuidSchema.nullable().default(null),
  classSessionId: uuidSchema.nullable().default(null),
  title: optionalShortText(200),
  body: longText(50_000),
  markers: z.array(noteMarkerSchema).default([]),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type CreateTaskItemInput = z.infer<typeof createTaskItemSchema>;
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
export type CreateGradeCategoryInput = z.infer<typeof createGradeCategorySchema>;
export type RecordGradeInput = z.infer<typeof recordGradeSchema>;
export type CreateInboxItemInput = z.infer<typeof createInboxItemSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
