import type { UserId } from '@pulse/types';
import {
  createAcademicPeriodRepository,
  createClassSessionRepository,
  createDocumentRepository,
  createInboxRepository,
  createNoteRepository,
  createReminderRepository,
  createCampusConnectionRepository,
  createInstitutionRepository,
  createSubjectRepository,
  createSubjectScheduleRepository,
  createTaskRepository,
} from '@pulse/database';
import { redirect } from 'next/navigation';
import { createClient } from './supabase-server';

/**
 * Signed in context for a server render or action.
 *
 * Repositories are built per request because each carries the caller's session,
 * which is what keeps row level security in force.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return {
    userId: user.id as UserId,
    email: user.email ?? '',
    // Exposed for storage calls, which are not part of the repository ports.
    supabase,
    db: {
      institutions: createInstitutionRepository(supabase),
      campusConnections: createCampusConnectionRepository(supabase),
      periods: createAcademicPeriodRepository(supabase),
      subjects: createSubjectRepository(supabase),
      schedules: createSubjectScheduleRepository(supabase),
      sessions: createClassSessionRepository(supabase),
      tasks: createTaskRepository(supabase),
      documents: createDocumentRepository(supabase),
      inbox: createInboxRepository(supabase),
      notes: createNoteRepository(supabase),
      reminders: createReminderRepository(supabase),
    },
  };
}
