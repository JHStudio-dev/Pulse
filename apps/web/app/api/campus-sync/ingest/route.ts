import { NextResponse } from 'next/server';
import {
  createAcademicPeriodRepository,
  createCampusConnectionRepository,
  createCampusSyncRepository,
  createDocumentRepository,
  createSubjectRepository,
  createSubjectScheduleRepository,
  createTaskRepository,
} from '@pulse/database';
import type { UserId } from '@pulse/types';
import { campusSyncIngestRequestSchema } from '@pulse/validation';
import { createClient } from '@/lib/supabase-server';
import { ingestCampusSnapshot } from '@/lib/campus-sync-ingest';

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

  try {
    const outcome = await ingestCampusSnapshot(user.id as UserId, parsed.data, {
      periods: createAcademicPeriodRepository(supabase),
      subjects: createSubjectRepository(supabase),
      connections: createCampusConnectionRepository(supabase),
      campusSync: createCampusSyncRepository(supabase),
      tasks: createTaskRepository(supabase),
      documents: createDocumentRepository(supabase),
      schedules: createSubjectScheduleRepository(supabase),
    });

    return outcome.ok
      ? NextResponse.json(outcome.result)
      : NextResponse.json({ error: outcome.error }, { status: outcome.status });
  } catch {
    return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
  }
}
