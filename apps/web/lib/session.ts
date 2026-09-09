import type { UserId } from '@pulse/types';
import {
  createAcademicPeriodRepository,
  createCampusConnectionRepository,
  createInstitutionRepository,
  createSubjectRepository,
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
    db: {
      institutions: createInstitutionRepository(supabase),
      campusConnections: createCampusConnectionRepository(supabase),
      periods: createAcademicPeriodRepository(supabase),
      subjects: createSubjectRepository(supabase),
    },
  };
}
