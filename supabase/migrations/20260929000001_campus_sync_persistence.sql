-- Persistent state for Campus Sync.
--
-- External LMS identifiers stay outside the core academic tables. That lets a
-- Chamilo assignment and a Moodle assignment map into the same Pulse task model
-- without teaching tasks or documents about either provider.

create type campus_sync_run_status as enum ('running', 'completed', 'failed');

create type campus_sync_item_kind as enum (
  'document',
  'assignment',
  'announcement',
  'event'
);

-- Composite children use (id, user_id) so no student-owned row can reference
-- another student's campus connection.
alter table campus_connections
  add constraint campus_connections_id_user_key unique (id, user_id);

create table campus_subject_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campus_connection_id uuid not null,
  subject_id uuid not null,
  external_course_id text not null,
  external_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campus_subject_links_connection_fk
    foreign key (campus_connection_id, user_id)
    references campus_connections (id, user_id) on delete cascade,
  constraint campus_subject_links_subject_fk
    foreign key (subject_id, user_id)
    references subjects (id, user_id) on delete cascade,
  unique (id, user_id)
);

create unique index campus_subject_links_external_idx
  on campus_subject_links (
    user_id,
    campus_connection_id,
    external_course_id,
    coalesce(external_session_id, '')
  );

create index campus_subject_links_subject_idx
  on campus_subject_links (subject_id);

create trigger campus_subject_links_set_updated_at
  before update on campus_subject_links
  for each row execute function set_updated_at();

create table campus_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_link_id uuid not null,
  status campus_sync_run_status not null default 'running',
  discovered_count integer not null default 0 check (discovered_count >= 0),
  new_count integer not null default 0 check (new_count >= 0),
  changed_count integer not null default 0 check (changed_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  ignored_count integer not null default 0 check (ignored_count >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  constraint campus_sync_runs_subject_link_fk
    foreign key (subject_link_id, user_id)
    references campus_subject_links (id, user_id) on delete cascade,
  constraint campus_sync_runs_status_time_valid check (
    (status = 'running' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  ),
  constraint campus_sync_runs_counts_valid check (
    discovered_count = new_count + changed_count + unchanged_count + ignored_count
  ),
  unique (id, user_id),
  unique (id, user_id, subject_link_id)
);

create index campus_sync_runs_subject_started_idx
  on campus_sync_runs (subject_link_id, started_at desc);

create table campus_sync_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campus_subject_link_id uuid not null,
  last_sync_run_id uuid not null,
  kind campus_sync_item_kind not null,
  external_id text not null,
  source_url text,
  content_hash text not null,
  payload jsonb not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  applied_at timestamptz,
  constraint campus_sync_items_subject_link_fk
    foreign key (campus_subject_link_id, user_id)
    references campus_subject_links (id, user_id) on delete cascade,
  constraint campus_sync_items_run_fk
    foreign key (last_sync_run_id, user_id, campus_subject_link_id)
    references campus_sync_runs (id, user_id, subject_link_id) on delete cascade,
  constraint campus_sync_items_payload_object check (jsonb_typeof(payload) = 'object'),
  unique (id, user_id),
  unique (user_id, campus_subject_link_id, kind, external_id)
);

create index campus_sync_items_subject_kind_idx
  on campus_sync_items (campus_subject_link_id, kind);

create index campus_sync_items_last_run_idx
  on campus_sync_items (last_sync_run_id);

alter table campus_subject_links enable row level security;
alter table campus_sync_runs enable row level security;
alter table campus_sync_items enable row level security;

create policy campus_subject_links_select
  on campus_subject_links for select to authenticated
  using (user_id = (select auth.uid()));

create policy campus_subject_links_insert
  on campus_subject_links for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy campus_subject_links_update
  on campus_subject_links for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy campus_subject_links_delete
  on campus_subject_links for delete to authenticated
  using (user_id = (select auth.uid()));

create policy campus_sync_runs_select
  on campus_sync_runs for select to authenticated
  using (user_id = (select auth.uid()));

create policy campus_sync_runs_insert
  on campus_sync_runs for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy campus_sync_runs_update
  on campus_sync_runs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy campus_sync_runs_delete
  on campus_sync_runs for delete to authenticated
  using (user_id = (select auth.uid()));

create policy campus_sync_items_select
  on campus_sync_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy campus_sync_items_insert
  on campus_sync_items for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy campus_sync_items_update
  on campus_sync_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy campus_sync_items_delete
  on campus_sync_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- Migrations may run under a role different from the one that owns the default
-- privilege rule, so grant the new tables explicitly as well.
grant all on campus_subject_links, campus_sync_runs, campus_sync_items
  to anon, authenticated, service_role;
