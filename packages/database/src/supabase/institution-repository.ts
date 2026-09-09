import type { CampusInstance, University, UniversityId } from '@pulse/types';
import type { InstitutionRepository } from '../ports/repositories';
import { translateError } from './errors';
import type { PulseSupabaseClient } from './client';
import { toCampusInstance, toUniversity } from './mappers';
import type { CampusInstanceRow, UniversityRow } from './rows';

/** Reference data is shared, so these reads carry no user filter. */
export function createInstitutionRepository(client: PulseSupabaseClient): InstitutionRepository {
  return {
    async listUniversities(): Promise<University[]> {
      const { data, error } = await client.from('universities').select('*').order('abbreviation');

      if (error) throw translateError(error);
      return (data as UniversityRow[]).map(toUniversity);
    },

    async listCampusInstances(universityId: UniversityId): Promise<CampusInstance[]> {
      const { data, error } = await client
        .from('campus_instances')
        .select('*')
        .eq('university_id', universityId)
        .order('name');

      if (error) throw translateError(error);
      return (data as CampusInstanceRow[]).map(toCampusInstance);
    },
  };
}
