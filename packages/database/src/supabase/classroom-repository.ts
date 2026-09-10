import type {
  Attendance,
  AttendanceStatus,
  ClassMarker,
  ClassMarkerId,
  ClassMarkerKind,
  ClassSessionId,
  UserId,
} from '@pulse/types';
import type { AttendanceRepository, ClassMarkerRepository } from '../ports/repositories';
import type { PulseSupabaseClient } from './client';
import { translateError } from './errors';
import { toAttendance, toClassMarker } from './mappers';
import type { AttendanceRow, ClassMarkerRow } from './rows';

export function createAttendanceRepository(client: PulseSupabaseClient): AttendanceRepository {
  return {
    async findBySession(userId: UserId, sessionId: ClassSessionId): Promise<Attendance | null> {
      const { data, error } = await client
        .from('attendance')
        .select('*')
        .eq('user_id', userId)
        .eq('class_session_id', sessionId)
        .maybeSingle();

      if (error) throw translateError(error);
      return data ? toAttendance(data as AttendanceRow) : null;
    },

    /**
     * Records attendance for a session.
     *
     * Upserted on the session id: attendance is one row per class, and a student
     * correcting what they marked should not create a second record.
     */
    async record(userId: UserId, attendance: Attendance): Promise<Attendance> {
      const { data, error } = await client
        .from('attendance')
        .upsert(
          {
            class_session_id: attendance.classSessionId,
            user_id: userId,
            status: attendance.status,
            note: attendance.note,
            recorded_at: attendance.recordedAt,
          },
          { onConflict: 'class_session_id' },
        )
        .select()
        .single();

      if (error) throw translateError(error);
      return toAttendance(data as AttendanceRow);
    },
  };
}

export function createClassMarkerRepository(client: PulseSupabaseClient): ClassMarkerRepository {
  return {
    async listBySession(userId: UserId, sessionId: ClassSessionId): Promise<ClassMarker[]> {
      const { data, error } = await client
        .from('class_markers')
        .select('*')
        .eq('user_id', userId)
        .eq('class_session_id', sessionId)
        .order('offset_seconds');

      if (error) throw translateError(error);
      return (data as ClassMarkerRow[]).map(toClassMarker);
    },

    async create(
      userId: UserId,
      sessionId: ClassSessionId,
      kind: ClassMarkerKind,
      offsetSeconds: number,
      note: string | null,
    ): Promise<ClassMarker> {
      const { data, error } = await client
        .from('class_markers')
        .insert({
          user_id: userId,
          class_session_id: sessionId,
          kind,
          offset_seconds: offsetSeconds,
          note,
        })
        .select()
        .single();

      if (error) throw translateError(error);
      return toClassMarker(data as ClassMarkerRow);
    },

    async remove(userId: UserId, id: ClassMarkerId): Promise<void> {
      const { error } = await client
        .from('class_markers')
        .delete()
        .eq('user_id', userId)
        .eq('id', id);

      if (error) throw translateError(error);
    },
  };
}

/** Attendance status values that call for a recovery plan. */
export const RECOVERABLE_STATUSES: readonly AttendanceStatus[] = ['missed', 'partial'];
