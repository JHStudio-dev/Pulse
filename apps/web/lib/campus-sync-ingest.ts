import {
  classifyCampusSyncItem,
  missingScheduleWeekdays,
  normalizeExternalSessionId,
  prepareCampusSyncSnapshot,
  resolveCampusSubjectLink,
} from '@pulse/core';
import type {
  AcademicPeriodRepository,
  CampusConnectionRepository,
  CampusSyncRepository,
  SubjectRepository,
  SubjectScheduleRepository,
} from '@pulse/database';
import type {
  AcademicPeriodId,
  CampusSyncItem,
  CampusSyncSnapshot,
  CampusSyncSummary,
  Subject,
  SubjectId,
  UserId,
} from '@pulse/types';
import type { CampusSyncIngestRequest } from '@pulse/validation';
import { applyCampusSyncItem, type CampusSyncApplyRepositories } from './campus-sync-apply';

export interface CampusSyncIngestRepositories extends CampusSyncApplyRepositories {
  periods: Pick<AcademicPeriodRepository, 'findActive'>;
  subjects: Pick<SubjectRepository, 'findById' | 'create' | 'update' | 'restore'>;
  connections: Pick<CampusConnectionRepository, 'findByUser' | 'markSyncSuccess' | 'markSyncError'>;
  campusSync: CampusSyncRepository;
  schedules: Pick<SubjectScheduleRepository, 'listBySubject' | 'create'>;
}

export interface CampusSyncIngestResult {
  runId: string;
  courseExternalId: string;
  subjectId: SubjectId;
  subjectName: string;
  createdSubject: boolean;
  summary: CampusSyncSummary;
}

export type CampusSyncIngestOutcome =
  | { ok: true; result: CampusSyncIngestResult }
  | { ok: false; status: 404 | 409 | 500; error: string };

type ConfirmedSchedule = NonNullable<CampusSyncIngestRequest['schedule']>;

function itemKey(item: Pick<CampusSyncItem, 'kind' | 'externalId'>): string {
  return `${item.kind}:${item.externalId}`;
}

function createSubjectFromSnapshot(
  userId: UserId,
  snapshot: CampusSyncSnapshot,
  academicPeriodId: AcademicPeriodId,
  campusInstanceId: Subject['campusInstanceId'],
  subjects: CampusSyncIngestRepositories['subjects'],
): Promise<Subject> {
  return subjects.create(userId, {
    academicPeriodId,
    campusInstanceId,
    name: snapshot.course.title ?? snapshot.course.externalId,
    code: snapshot.course.code ?? snapshot.course.externalId,
    professorName: snapshot.course.teacher ?? null,
    professorContact: null,
    passingGrade: null,
    gradeScaleMax: 100,
    defaultModality: 'unconfirmed',
    defaultMeetingUrl: null,
    defaultLocation: {
      campus: null,
      building: null,
      room: null,
    },
    travelBufferMinutes: null,
    color: null,
    archivedAt: null,
  });
}

async function enrichSubjectFromSnapshot(
  userId: UserId,
  subject: Subject,
  snapshot: CampusSyncSnapshot,
  campusInstanceId: Subject['campusInstanceId'],
  subjects: CampusSyncIngestRepositories['subjects'],
): Promise<Subject> {
  const title = snapshot.course.title?.trim();
  const teacher = snapshot.course.teacher?.trim();
  const code = snapshot.course.code?.trim() || snapshot.course.externalId;

  const shouldReplaceName =
    Boolean(title) &&
    title !== snapshot.course.externalId &&
    (subject.name === snapshot.course.externalId || subject.name === subject.code);

  const shouldAddTeacher = Boolean(teacher) && !subject.professorName;
  const shouldSetCampus = subject.campusInstanceId === null;

  if (!shouldReplaceName && !shouldAddTeacher && !shouldSetCampus) {
    return subject;
  }

  return subjects.update(userId, subject.id, {
    ...(shouldReplaceName ? { name: title! } : {}),
    ...(subject.code === null ? { code } : {}),
    ...(shouldAddTeacher ? { professorName: teacher! } : {}),
    ...(shouldSetCampus ? { campusInstanceId } : {}),
  });
}

async function applyConfirmedSchedule(
  userId: UserId,
  subject: Subject,
  schedule: ConfirmedSchedule,
  repositories: Pick<CampusSyncIngestRepositories, 'schedules' | 'subjects'>,
): Promise<Subject> {
  const existing = await repositories.schedules.listBySubject(userId, subject.id);

  for (const weekday of missingScheduleWeekdays(existing, schedule)) {
    await repositories.schedules.create(userId, {
      subjectId: subject.id,
      weekday,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      modality: schedule.modality,
      meetingUrl: schedule.meetingUrl,
      location: schedule.location,
      activeRange: null,
    });
  }

  const updates: Partial<Omit<Subject, 'id' | 'userId'>> = {};

  if (subject.defaultModality === 'unconfirmed' && schedule.modality !== 'unconfirmed') {
    updates.defaultModality = schedule.modality;
  }

  if (subject.defaultMeetingUrl === null && schedule.meetingUrl !== null) {
    updates.defaultMeetingUrl = schedule.meetingUrl;
  }

  if (Object.keys(updates).length === 0) return subject;
  return repositories.subjects.update(userId, subject.id, updates);
}

/**
 * Stores one course snapshot for a student.
 *
 * Campus items only ever add or update Pulse records: a section missing from
 * the snapshot leaves earlier tasks and documents untouched. Campus Sync always
 * writes into the active period, so a course still tied to a subject from an
 * earlier period is refused instead of reviving or moving that history.
 */
export async function ingestCampusSnapshot(
  userId: UserId,
  request: CampusSyncIngestRequest,
  repositories: CampusSyncIngestRepositories,
): Promise<CampusSyncIngestOutcome> {
  const { subjects, periods, connections, campusSync } = repositories;

  const connection = await connections.findByUser(userId);
  if (!connection) return { ok: false, status: 409, error: 'campus_not_configured' };

  const period = await periods.findActive(userId);
  if (!period) return { ok: false, status: 409, error: 'active_period_not_found' };

  const snapshot: CampusSyncSnapshot = request.snapshot;
  const externalSessionId = normalizeExternalSessionId(snapshot.course.sessionId);
  const existingLink = resolveCampusSubjectLink(await campusSync.listSubjectLinks(userId), {
    campusConnectionId: connection.id,
    externalCourseId: snapshot.course.externalId,
    externalSessionId,
  });
  const linkedSubject = existingLink
    ? await subjects.findById(userId, existingLink.subjectId)
    : null;

  let subject: Subject | null = null;
  let createdSubject = false;

  if (request.mode === 'link') {
    subject = await subjects.findById(userId, request.subjectId as SubjectId);

    if (!subject) return { ok: false, status: 404, error: 'subject_not_found' };

    if (subject.campusInstanceId !== null && subject.campusInstanceId !== connection.campusInstanceId) {
      return { ok: false, status: 409, error: 'subject_campus_mismatch' };
    }

    if (subject.academicPeriodId !== period.id) {
      return { ok: false, status: 409, error: 'subject_not_in_active_period' };
    }
  } else {
    subject = linkedSubject;
  }

  if (linkedSubject && linkedSubject.academicPeriodId !== period.id) {
    return { ok: false, status: 409, error: 'course_linked_to_previous_period' };
  }

  if (!subject) {
    subject = await createSubjectFromSnapshot(
      userId,
      snapshot,
      period.id,
      connection.campusInstanceId,
      subjects,
    );
    createdSubject = true;
  }

  if (subject.archivedAt !== null) {
    subject = await subjects.restore(userId, subject.id);
  }

  subject = await enrichSubjectFromSnapshot(
    userId,
    subject,
    snapshot,
    connection.campusInstanceId,
    subjects,
  );

  if (request.schedule) {
    subject = await applyConfirmedSchedule(userId, subject, request.schedule, repositories);
  }

  const subjectLink = existingLink
    ? await campusSync.updateSubjectLink(userId, existingLink.id, {
        subjectId: subject.id,
        externalSessionId: externalSessionId ?? existingLink.externalSessionId,
      })
    : await campusSync.upsertSubjectLink(userId, {
        campusConnectionId: connection.id,
        subjectId: subject.id,
        externalCourseId: snapshot.course.externalId,
        externalSessionId,
      });

  const prepared = prepareCampusSyncSnapshot(snapshot);
  const incoming = [...new Map(prepared.map((item) => [itemKey(item), item])).values()];
  const existing = await campusSync.listItems(userId, subjectLink.id);
  const existingByKey = new Map(existing.map((item) => [itemKey(item), item]));

  const summary: CampusSyncSummary = {
    discoveredCount: incoming.length,
    newCount: 0,
    changedCount: 0,
    unchangedCount: 0,
    ignoredCount: 0,
  };

  const run = await campusSync.startRun(userId, subjectLink.id);

  try {
    for (const item of incoming) {
      const state = classifyCampusSyncItem(existingByKey.get(itemKey(item)) ?? null, item);

      if (state === 'new') summary.newCount += 1;
      else if (state === 'changed') summary.changedCount += 1;
      else summary.unchangedCount += 1;

      const persisted = await campusSync.upsertItem(userId, subjectLink.id, run.id, item, state);

      if (
        state !== 'unchanged' ||
        (persisted.kind === 'assignment' && persisted.appliedTaskId === null) ||
        (persisted.kind === 'document' && persisted.appliedDocumentId === null)
      ) {
        await applyCampusSyncItem(userId, subject.id, persisted, repositories);
      }
    }

    const completed = await campusSync.completeRun(userId, run.id, summary);
    await connections.markSyncSuccess(userId, connection.id);

    return {
      ok: true,
      result: {
        runId: completed.id,
        courseExternalId: subjectLink.externalCourseId,
        subjectId: subject.id,
        subjectName: subject.name,
        createdSubject,
        summary,
      },
    };
  } catch (error) {
    const processed = summary.newCount + summary.changedCount + summary.unchangedCount;
    summary.ignoredCount = Math.max(0, summary.discoveredCount - processed);

    const message = error instanceof Error ? error.message : 'Campus sync failed';

    try {
      await campusSync.failRun(userId, run.id, message, summary);
      await connections.markSyncError(userId, connection.id, message);
    } catch {
      // Preserve the original ingestion failure.
    }

    return { ok: false, status: 500, error: 'sync_failed' };
  }
}
