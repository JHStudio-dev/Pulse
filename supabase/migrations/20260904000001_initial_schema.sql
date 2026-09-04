-- Pulse initial schema.
--
-- Ownership model: every user-owned table carries user_id. Child tables also
-- carry it and reference their parent with a composite key (id, user_id), so a
-- row can never point at another student's parent record. That keeps every RLS
-- policy a plain user_id = auth.uid() check.

-- gen_random_uuid() is core Postgres since 13, so no extension is required.

-- Enums ----------------------------------------------------------------------

create type campus_platform as enum ('chamilo', 'moodle', 'manual');

create type campus_connection_status as enum (
  'disconnected', 'connected', 'needs_reauth', 'error'
);

create type academic_period_status as enum ('planned', 'active', 'archived');

create type modality as enum ('in_person', 'virtual', 'hybrid', 'unconfirmed');

create type class_session_status as enum ('scheduled', 'completed', 'cancelled');

create type attendance_status as enum ('attended', 'partial', 'missed', 'cancelled');

create type task_status as enum ('pending', 'in_progress', 'done', 'submitted', 'overdue');

create type task_difficulty as enum ('easy', 'medium', 'hard');

create type assessment_type as enum (
  'exam', 'midterm', 'quiz', 'project', 'presentation', 'lab', 'graded_task', 'final'
);

create type document_source as enum ('upload', 'link', 'campus_sync');

create type note_marker as enum ('question', 'important', 'exam', 'task', 'missed');

create type inbox_item_status as enum ('unprocessed', 'converted', 'discarded');

create type recovery_status as enum ('pending', 'recovering', 'recovered');

create type recovery_item_kind as enum (
  'review_material', 'get_notes', 'confirm_topics', 'check_new_dates', 'practice', 'ask_question'
);

create type reminder_target_kind as enum ('class_session', 'task', 'assessment');

create type reminder_kind as enum ('lead_time', 'departure', 'start');

create type notification_status as enum ('scheduled', 'sent', 'read', 'dismissed', 'suppressed');

create type theme_preference as enum ('light', 'dark', 'system');

-- Shared trigger --------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Profiles ---------------------------------------------------------------------

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  time_zone text not null default 'UTC',
  locale text not null default 'es',
  theme theme_preference not null default 'system',
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Institutions (shared reference data, not user-owned) --------------------------

create table universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text not null unique,
  country_code text not null,
  created_at timestamptz not null default now()
);

create table campus_instances (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id) on delete cascade,
  name text not null,
  platform campus_platform not null,
  base_url text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index campus_instances_university_idx on campus_instances (university_id);

create table campus_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campus_instance_id uuid not null references campus_instances (id) on delete cascade,
  status campus_connection_status not null default 'disconnected',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, campus_instance_id)
);

create index campus_connections_user_idx on campus_connections (user_id);

create trigger campus_connections_set_updated_at
  before update on campus_connections
  for each row execute function set_updated_at();

-- Academic periods ---------------------------------------------------------------

create table academic_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date,
  status academic_period_status not null default 'planned',
  time_zone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_periods_range_valid check (end_date is null or end_date >= start_date),
  unique (id, user_id)
);

create index academic_periods_user_idx on academic_periods (user_id, status);

create trigger academic_periods_set_updated_at
  before update on academic_periods
  for each row execute function set_updated_at();

-- Subjects -------------------------------------------------------------------------

create table subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  academic_period_id uuid not null,
  campus_instance_id uuid references campus_instances (id) on delete set null,
  name text not null,
  code text,
  professor_name text,
  professor_contact text,
  passing_grade numeric(6, 2),
  grade_scale_max numeric(6, 2) not null default 100,
  default_modality modality not null default 'unconfirmed',
  default_meeting_url text,
  default_campus text,
  default_building text,
  default_room text,
  travel_buffer_minutes integer check (travel_buffer_minutes between 0 and 600),
  color text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_period_fk
    foreign key (academic_period_id, user_id)
    references academic_periods (id, user_id) on delete cascade,
  constraint subjects_scale_positive check (grade_scale_max > 0),
  unique (id, user_id)
);

create index subjects_period_idx on subjects (academic_period_id);
create index subjects_user_idx on subjects (user_id);

create trigger subjects_set_updated_at
  before update on subjects
  for each row execute function set_updated_at();

-- Recurring schedule ----------------------------------------------------------------

create table subject_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  modality modality not null,
  meeting_url text,
  campus text,
  building text,
  room text,
  active_from date,
  active_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subject_schedules_subject_fk
    foreign key (subject_id, user_id) references subjects (id, user_id) on delete cascade,
  constraint subject_schedules_time_valid check (end_time > start_time),
  constraint subject_schedules_range_valid
    check (active_until is null or active_from is null or active_until >= active_from),
  unique (id, user_id)
);

create index subject_schedules_subject_idx on subject_schedules (subject_id, weekday);

create trigger subject_schedules_set_updated_at
  before update on subject_schedules
  for each row execute function set_updated_at();

-- Concrete sessions -------------------------------------------------------------------

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null,
  subject_schedule_id uuid,
  session_date date not null,
  start_time time not null,
  end_time time not null,
  modality modality not null,
  status class_session_status not null default 'scheduled',
  meeting_url text,
  campus text,
  building text,
  room text,
  change_note text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_sessions_subject_fk
    foreign key (subject_id, user_id) references subjects (id, user_id) on delete cascade,
  constraint class_sessions_schedule_fk
    foreign key (subject_schedule_id, user_id)
    references subject_schedules (id, user_id) on delete set null,
  constraint class_sessions_time_valid check (end_time > start_time),
  unique (id, user_id)
);

create index class_sessions_subject_date_idx on class_sessions (subject_id, session_date);
create index class_sessions_user_date_idx on class_sessions (user_id, session_date);

create trigger class_sessions_set_updated_at
  before update on class_sessions
  for each row execute function set_updated_at();

create table attendance (
  class_session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  status attendance_status not null,
  note text,
  recorded_at timestamptz not null default now(),
  constraint attendance_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete cascade
);

create index attendance_user_idx on attendance (user_id, status);

-- Tasks ------------------------------------------------------------------------------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid,
  title text not null,
  description text,
  assigned_date date,
  due_date date,
  due_time time,
  status task_status not null default 'pending',
  difficulty task_difficulty,
  progress smallint not null default 0 check (progress between 0 and 100),
  estimated_minutes integer check (estimated_minutes > 0),
  academic_weight numeric(5, 2) check (academic_weight between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_subject_fk
    foreign key (subject_id, user_id) references subjects (id, user_id) on delete set null,
  constraint tasks_dates_valid check (assigned_date is null or due_date is null or due_date >= assigned_date),
  constraint tasks_due_time_needs_date check (due_time is null or due_date is not null),
  unique (id, user_id)
);

create index tasks_user_due_idx on tasks (user_id, due_date);
create index tasks_subject_idx on tasks (subject_id);

create trigger tasks_set_updated_at
  before update on tasks
  for each row execute function set_updated_at();

create table task_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  constraint task_items_task_fk
    foreign key (task_id, user_id) references tasks (id, user_id) on delete cascade
);

create index task_items_task_idx on task_items (task_id, position);

-- Assessments and grades ----------------------------------------------------------------

create table grade_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null,
  name text not null,
  weight numeric(5, 2) not null check (weight between 0 and 100),
  created_at timestamptz not null default now(),
  constraint grade_categories_subject_fk
    foreign key (subject_id, user_id) references subjects (id, user_id) on delete cascade,
  unique (id, user_id)
);

create index grade_categories_subject_idx on grade_categories (subject_id);

create table assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null,
  grade_category_id uuid,
  class_session_id uuid,
  title text not null,
  type assessment_type not null,
  assessment_date date,
  max_points numeric(8, 2) check (max_points > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessments_subject_fk
    foreign key (subject_id, user_id) references subjects (id, user_id) on delete cascade,
  constraint assessments_category_fk
    foreign key (grade_category_id, user_id)
    references grade_categories (id, user_id) on delete set null,
  constraint assessments_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete set null,
  unique (id, user_id)
);

create index assessments_subject_date_idx on assessments (subject_id, assessment_date);
create index assessments_user_date_idx on assessments (user_id, assessment_date);

create trigger assessments_set_updated_at
  before update on assessments
  for each row execute function set_updated_at();

create table grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id uuid not null unique,
  points_earned numeric(8, 2) not null check (points_earned >= 0),
  points_possible numeric(8, 2) not null check (points_possible > 0),
  recorded_at timestamptz not null default now(),
  constraint grades_assessment_fk
    foreign key (assessment_id, user_id) references assessments (id, user_id) on delete cascade,
  constraint grades_within_possible check (points_earned <= points_possible)
);

create index grades_user_idx on grades (user_id);

-- Documents, notes and inbox -----------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid,
  class_session_id uuid,
  title text not null,
  source document_source not null,
  storage_path text,
  external_url text,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  content_hash text,
  replaces_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_subject_fk
    foreign key (subject_id, user_id) references subjects (id, user_id) on delete set null,
  constraint documents_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete set null,
  constraint documents_replaces_fk
    foreign key (replaces_document_id, user_id)
    references documents (id, user_id) on delete set null,
  constraint documents_location_present check (storage_path is not null or external_url is not null),
  unique (id, user_id)
);

create index documents_subject_idx on documents (subject_id);
create index documents_user_idx on documents (user_id);
create index documents_hash_idx on documents (user_id, content_hash) where content_hash is not null;

create trigger documents_set_updated_at
  before update on documents
  for each row execute function set_updated_at();

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid,
  class_session_id uuid,
  title text,
  body text not null default '',
  markers note_marker[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_subject_fk
    foreign key (subject_id, user_id) references subjects (id, user_id) on delete set null,
  constraint notes_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete set null
);

create index notes_subject_idx on notes (subject_id);
create index notes_session_idx on notes (class_session_id);

create trigger notes_set_updated_at
  before update on notes
  for each row execute function set_updated_at();

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  raw_text text not null,
  status inbox_item_status not null default 'unprocessed',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index inbox_items_user_status_idx on inbox_items (user_id, status);

-- Recovery ---------------------------------------------------------------------------

create table recovery_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_session_id uuid not null unique,
  status recovery_status not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint recovery_plans_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete cascade,
  unique (id, user_id)
);

create index recovery_plans_user_status_idx on recovery_plans (user_id, status);

create table recovery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recovery_plan_id uuid not null,
  kind recovery_item_kind not null,
  label text not null,
  done boolean not null default false,
  position integer not null default 0,
  constraint recovery_items_plan_fk
    foreign key (recovery_plan_id, user_id)
    references recovery_plans (id, user_id) on delete cascade
);

create index recovery_items_plan_idx on recovery_items (recovery_plan_id, position);

-- Reminders and notifications ------------------------------------------------------------

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_kind reminder_target_kind not null,
  class_session_id uuid,
  task_id uuid,
  assessment_id uuid,
  kind reminder_kind not null,
  offset_minutes integer not null check (offset_minutes >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint reminders_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete cascade,
  constraint reminders_task_fk
    foreign key (task_id, user_id) references tasks (id, user_id) on delete cascade,
  constraint reminders_assessment_fk
    foreign key (assessment_id, user_id) references assessments (id, user_id) on delete cascade,
  -- Exactly one target, matching target_kind.
  constraint reminders_single_target check (
    (target_kind = 'class_session' and class_session_id is not null and task_id is null and assessment_id is null)
    or (target_kind = 'task' and task_id is not null and class_session_id is null and assessment_id is null)
    or (target_kind = 'assessment' and assessment_id is not null and class_session_id is null and task_id is null)
  ),
  unique (id, user_id)
);

create index reminders_user_idx on reminders (user_id, enabled);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reminder_id uuid,
  title text not null,
  body text,
  scheduled_for timestamptz not null,
  status notification_status not null default 'scheduled',
  sent_at timestamptz,
  read_at timestamptz,
  constraint notifications_reminder_fk
    foreign key (reminder_id, user_id) references reminders (id, user_id) on delete set null
);

create index notifications_user_scheduled_idx on notifications (user_id, status, scheduled_for);
