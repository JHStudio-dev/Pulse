import { NextResponse } from 'next/server';
import { classifyCampusSyncItem, prepareCampusSyncSnapshot } from '@pulse/core';
import {
  createAcademicPeriodRepository,
  createCampusConnectionRepository,
  createCampusSyncRepository,
  createSubjectRepository,
} from '@pulse/database';
import type {
  CampusSyncItem,
  CampusSyncSnapshot,
  CampusSyncSummary,
  Subject,
  SubjectId,
  UserId,
} from '@pulse/types';
import { campusSyncIngestRequestSchema } from '@pulse/validation';
import { createClient } from '@/lib/supabase-server';

function itemKey(item: Pick<CampusSyncItem, 'kind' | 'externalId'>): string {
  return `${item.kind}:${item.externalId}`;
}

async function createSubjectFromSnapshot(
  userId: UserId,
  snapshot: CampusSyncSnapshot,
  campusInstanceId: Subject['campusInstanceId'],
  subjects: ReturnType<typeof createSubjectRepository>,
  periods: ReturnType<typeof createAcademicPeriodRepository>,
): Promise<Subject | null> {
  const period = await periods.findActive(userId);
  if (!period) return null;

  return subjects.create(userId, {
    academicPeriodId: period.id,
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

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = campusSyncIngestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'invalid_snapshot',
        issue: parsed.error.issues[0]?.message ?? 'Invalid campus sync payload',
      },
      { status: 400 },
    );
  }

  const userId = user.id as UserId;
  const subjects = createSubjectRepository(supabase);
  const periods = createAcademicPeriodRepository(supabase);
  const connections = createCampusConnectionRepository(supabase);
  const campusSync = createCampusSyncRepository(supabase);

  const connection = await connections.findByUser(userId);
  if (!connection) {
    return NextResponse.json({ error: 'campus_not_configured' }, { status: 409 });
  }

  const snapshot = parsed.data.snapshot;
  const externalSessionId = snapshot.course.sessionId ?? null;
  let subject: Subject | null = null;
  let createdSubject = false;

  if (parsed.data.mode === 'link') {
    subject = await subjects.findById(userId, parsed.data.subjectId as SubjectId);

    if (!subject) {
      return NextResponse.json({ error: 'subject_not_found' }, { status: 404 });
    }

    if (
      subject.campusInstanceId !== null &&
      subject.campusInstanceId !== connection.campusInstanceId
    ) {
      return NextResponse.json({ error: 'subject_campus_mismatch' }, { status: 409 });
    }
  } else {
    const existingLink = await campusSync.findSubjectLink(
      userId,
      connection.id,
      snapshot.course.externalId,
      externalSessionId,
    );

    if (existingLink) {
      subject = await subjects.findById(userId, existingLink.subjectId);
    }

    if (!subject) {
      subject = await createSubjectFromSnapshot(
        userId,
        snapshot,
        connection.campusInstanceId,
        subjects,
        periods,
      );
      createdSubject = subject !== null;
    }

    if (!subject) {
      return NextResponse.json({ error: 'active_period_not_found' }, { status: 409 });
    }
  }

  const subjectLink = await campusSync.upsertSubjectLink(userId, {
    campusConnectionId: connection.id,
    subjectId: subject.id,
    externalCourseId: snapshot.course.externalId,
    externalSessionId,
  });

  const prepared = prepareCampusSyncSnapshot(snapshot);
  const uniqueIncoming = new Map(prepared.map((item) => [itemKey(item), item]));
  const incoming = [...uniqueIncoming.values()];
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

      await campusSync.upsertItem(userId, subjectLink.id, run.id, item);
    }

    const completed = await campusSync.completeRun(userId, run.id, summary);
    await connections.markSyncSuccess(userId, connection.id);

    return NextResponse.json({
      runId: completed.id,
      courseExternalId: subjectLink.externalCourseId,
      subjectId: subject.id,
      subjectName: subject.name,
      createdSubject,
      summary,
    });
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

    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
