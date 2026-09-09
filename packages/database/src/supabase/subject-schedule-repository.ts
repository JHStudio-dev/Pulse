import type { AcademicPeriodId, SubjectId, SubjectSchedule, UserId } from '@pulse/types';
import type { SubjectScheduleRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { fromTimeOfDay, toSubjectSchedule } from './mappers';
import type { SubjectScheduleRow } from './rows';

const TABLE = 'subject_schedules';

export function createSubjectScheduleRepository(
  client: PulseSupabaseClient,
): SubjectScheduleRepository {
  return {
    async listBySubject(userId: UserId, subjectId: SubjectId): Promise<SubjectSchedule[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*')
        .eq('user_id', userId)
        .eq('subject_id', subjectId)
        .order('weekday')
        .order('start_time');

      if (error) throw translateError(error);
      return (data as SubjectScheduleRow[]).map(toSubjectSchedule);
    },

    /**
     * Every slot in a period, for the week view.
     *
     * The subject filter is an inner join rather than a second query, so a
     * schedule belonging to another period never comes back.
     */
    async listByPeriod(userId: UserId, periodId: AcademicPeriodId): Promise<SubjectSchedule[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('*, subjects!inner(academic_period_id)')
        .eq('user_id', userId)
        .eq('subjects.academic_period_id', periodId)
        .order('weekday')
        .order('start_time');

      if (error) throw translateError(error);
      return (data as SubjectScheduleRow[]).map(toSubjectSchedule);
    },

    async create(
      userId: UserId,
      input: Omit<SubjectSchedule, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<SubjectSchedule> {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          user_id: userId,
          subject_id: input.subjectId,
          weekday: input.weekday,
          start_time: fromTimeOfDay(input.startTime),
          end_time: fromTimeOfDay(input.endTime),
          modality: input.modality,
          meeting_url: input.meetingUrl,
          campus: input.location.campus,
          building: input.location.building,
          room: input.location.room,
          active_from: input.activeRange?.start ?? null,
          active_until: input.activeRange?.end ?? null,
        })
        .select()
        .single();

      if (error) throw translateError(error);
      return toSubjectSchedule(data as SubjectScheduleRow);
    },

    async remove(userId: UserId, id: SubjectSchedule['id']): Promise<void> {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id);

      if (error) throw translateError(error);
    },
  };
}
