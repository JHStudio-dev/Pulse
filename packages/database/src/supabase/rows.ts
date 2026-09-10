/** Row shapes as PostgREST returns them, mirroring the migration columns. */

export type ModalityValue = 'in_person' | 'virtual' | 'hybrid' | 'unconfirmed';

export interface ProfileRow {
  user_id: string;
  display_name: string | null;
  time_zone: string;
  locale: string;
  theme: 'light' | 'dark' | 'system';
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcademicPeriodRow {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  status: 'planned' | 'active' | 'archived';
  time_zone: string;
  created_at: string;
  updated_at: string;
}

export interface SubjectRow {
  id: string;
  user_id: string;
  academic_period_id: string;
  campus_instance_id: string | null;
  name: string;
  code: string | null;
  professor_name: string | null;
  professor_contact: string | null;
  passing_grade: number | null;
  grade_scale_max: number;
  default_modality: ModalityValue;
  default_meeting_url: string | null;
  default_campus: string | null;
  default_building: string | null;
  default_room: string | null;
  travel_buffer_minutes: number | null;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubjectScheduleRow {
  id: string;
  user_id: string;
  subject_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  modality: ModalityValue;
  meeting_url: string | null;
  campus: string | null;
  building: string | null;
  room: string | null;
  active_from: string | null;
  active_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClassSessionRow {
  id: string;
  user_id: string;
  subject_id: string;
  subject_schedule_id: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  modality: ModalityValue;
  status: 'scheduled' | 'completed' | 'cancelled';
  meeting_url: string | null;
  campus: string | null;
  building: string | null;
  room: string | null;
  change_note: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRow {
  class_session_id: string;
  user_id: string;
  status: 'attended' | 'partial' | 'missed' | 'cancelled';
  note: string | null;
  recorded_at: string;
}

export interface TaskRow {
  id: string;
  user_id: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  assigned_date: string | null;
  due_date: string | null;
  due_time: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'submitted' | 'overdue';
  difficulty: 'easy' | 'medium' | 'hard' | null;
  progress: number;
  estimated_minutes: number | null;
  academic_weight: number | null;
  created_at: string;
  updated_at: string;
}

export interface UniversityRow {
  id: string;
  name: string;
  abbreviation: string;
  country_code: string;
  created_at: string;
}

export interface CampusInstanceRow {
  id: string;
  university_id: string;
  name: string;
  platform: 'chamilo' | 'moodle' | 'manual';
  base_url: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface CampusConnectionRow {
  id: string;
  user_id: string;
  campus_instance_id: string;
  status: 'disconnected' | 'connected' | 'needs_reauth' | 'error';
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  subject_id: string | null;
  class_session_id: string | null;
  title: string;
  source: 'upload' | 'link' | 'campus_sync';
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  content_hash: string | null;
  replaces_document_id: string | null;
  created_at: string;
  updated_at: string;
}
