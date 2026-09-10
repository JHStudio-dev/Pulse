-- Markers recorded during a class.
--
-- A marker is a point the student flagged while the session was running: a
-- note, a question, something important, a task that was mentioned, or a moment
-- they lost the thread.
--
-- `offset_seconds` stores how far into the session the marker was placed rather
-- than a wall clock time. That keeps it meaningful if the session is later
-- matched with a recording, and it is what turns "me perdí" into a concrete
-- point to review instead of a vague complaint.

create type class_marker_kind as enum ('note', 'question', 'important', 'task', 'missed');

create table class_markers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_session_id uuid not null,
  kind class_marker_kind not null,
  -- Optional: a marker is useful even when the student had no time to type.
  note text,
  offset_seconds integer not null default 0 check (offset_seconds >= 0),
  created_at timestamptz not null default now(),
  constraint class_markers_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete cascade
);

create index class_markers_session_idx on class_markers (class_session_id, offset_seconds);
create index class_markers_user_kind_idx on class_markers (user_id, kind);

-- Same ownership rule as every other user-owned table.
alter table class_markers enable row level security;

create policy class_markers_select
  on class_markers for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy class_markers_insert
  on class_markers for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy class_markers_update
  on class_markers for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy class_markers_delete
  on class_markers for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant all on class_markers to anon, authenticated, service_role;
