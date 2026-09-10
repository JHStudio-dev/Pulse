-- Class recordings and the tables that later processing will fill.
--
-- Only the recording side is used yet. The rest of the pipeline — transcripts,
-- segments, extracted items, summaries and model usage — is created now so the
-- shape is settled before anything writes to it, and so a recording can be
-- deleted with its derived data in one cascade.
--
-- Nothing here names a transcription or model provider. `provider` and `model`
-- are free text on purpose: swapping one out must not need a migration.

create type recording_status as enum (
  'uploaded',
  'queued',
  'transcribing',
  'analyzing',
  'ready',
  'failed'
);

-- Why the student is allowed to hold this audio. Pulse only processes
-- recordings the student may record or use, and the answer is recorded rather
-- than assumed.
create type recording_permission as enum ('own_permission', 'official_material');

create type extracted_item_kind as enum (
  'task',
  'date',
  'assessment',
  'resource',
  'important',
  'question'
);

create type extracted_item_status as enum ('detected', 'confirmed', 'dismissed');

-- Recordings --------------------------------------------------------------------------

create table recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_session_id uuid not null,
  storage_path text not null unique,
  original_filename text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  -- Reported by the client, which is the only side that knows how long the
  -- audio runs without decoding it on the server. Bounded here so a wrong or
  -- forged value cannot describe a recording longer than the limit, and left
  -- nullable because a browser cannot always read it.
  duration_seconds integer check (duration_seconds > 0 and duration_seconds <= 7200),
  status recording_status not null default 'uploaded',
  -- Queue bookkeeping. Processing runs outside the request that uploads the
  -- file, so the row carries everything a worker needs to pick it up, retry it
  -- and explain a failure.
  queued_at timestamptz,
  processing_started_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  failure_reason text,
  permission recording_permission not null,
  -- Explicit, per recording, and never defaulted from a previous answer.
  permission_confirmed_at timestamptz not null default now(),
  -- Recordings are kept until the student says otherwise. `delete_after` is the
  -- hook a configurable retention policy will set later.
  retain boolean not null default true,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordings_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete cascade,
  constraint recordings_failure_explained
    check (status <> 'failed' or failure_reason is not null),
  unique (id, user_id)
);

create index recordings_session_idx on recordings (class_session_id);
create index recordings_user_idx on recordings (user_id, created_at desc);
-- The queue a background worker reads.
create index recordings_pending_idx on recordings (status, queued_at)
  where status in ('queued', 'transcribing', 'analyzing');

create trigger recordings_updated_at
  before update on recordings
  for each row execute function set_updated_at();

-- Transcripts -------------------------------------------------------------------------

create table transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recording_id uuid not null unique,
  language text,
  full_text text,
  provider text,
  model text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transcripts_recording_fk
    foreign key (recording_id, user_id)
    references recordings (id, user_id) on delete cascade,
  unique (id, user_id)
);

create index transcripts_user_idx on transcripts (user_id);

create trigger transcripts_updated_at
  before update on transcripts
  for each row execute function set_updated_at();

-- Segments carry the timestamps everything else points back to: a citation, a
-- search result, and the moment a "Me perdí" marker refers to.
create table transcript_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transcript_id uuid not null,
  position integer not null check (position >= 0),
  start_seconds numeric(10, 3) not null check (start_seconds >= 0),
  end_seconds numeric(10, 3) not null,
  speaker text,
  content text not null,
  created_at timestamptz not null default now(),
  constraint transcript_segments_transcript_fk
    foreign key (transcript_id, user_id)
    references transcripts (id, user_id) on delete cascade,
  constraint transcript_segments_span check (end_seconds >= start_seconds),
  unique (id, user_id),
  unique (transcript_id, position)
);

create index transcript_segments_lookup_idx
  on transcript_segments (transcript_id, start_seconds);

-- Extracted items ---------------------------------------------------------------------
--
-- What a class appeared to say, not what is true. An item stays `detected`
-- until the student confirms it, and only then does it become a task or an
-- assessment. `confidence` and `corroborated_by` inform that review; neither
-- decides it.

create table extracted_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_session_id uuid not null,
  transcript_id uuid,
  transcript_segment_id uuid,
  kind extracted_item_kind not null,
  status extracted_item_status not null default 'detected',
  content text not null,
  detected_date date,
  confidence numeric(4, 3) check (confidence >= 0 and confidence <= 1),
  corroborated_by text,
  confirmed_task_id uuid,
  confirmed_assessment_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint extracted_items_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete cascade,
  constraint extracted_items_transcript_fk
    foreign key (transcript_id, user_id)
    references transcripts (id, user_id) on delete cascade,
  constraint extracted_items_segment_fk
    foreign key (transcript_segment_id, user_id)
    references transcript_segments (id, user_id) on delete set null,
  constraint extracted_items_task_fk
    foreign key (confirmed_task_id, user_id)
    references tasks (id, user_id) on delete set null,
  constraint extracted_items_assessment_fk
    foreign key (confirmed_assessment_id, user_id)
    references assessments (id, user_id) on delete set null,
  constraint extracted_items_confirmed_reviewed
    check (status = 'detected' or reviewed_at is not null),
  unique (id, user_id)
);

create index extracted_items_session_idx on extracted_items (class_session_id, status);
create index extracted_items_user_idx on extracted_items (user_id, status);

create trigger extracted_items_updated_at
  before update on extracted_items
  for each row execute function set_updated_at();

-- Class summaries ---------------------------------------------------------------------
--
-- Versioned, because reprocessing a class produces a new summary and the
-- previous one should not silently disappear under the student.

create table class_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_session_id uuid not null,
  transcript_id uuid,
  version integer not null default 1 check (version > 0),
  headline text,
  brief text,
  detailed text,
  topics text[] not null default '{}',
  key_concepts text[] not null default '{}',
  provider text,
  model text,
  created_at timestamptz not null default now(),
  constraint class_summaries_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id) on delete cascade,
  constraint class_summaries_transcript_fk
    foreign key (transcript_id, user_id)
    references transcripts (id, user_id) on delete set null,
  unique (id, user_id),
  unique (class_session_id, version)
);

create index class_summaries_session_idx on class_summaries (class_session_id, version desc);

-- Model usage -------------------------------------------------------------------------
--
-- Transcription is paid per minute and analysis per token, so usage is recorded
-- per operation from the start. `unit` says what the counts mean; cost is stored
-- in millionths of a currency unit to keep money out of floating point.

create table model_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  provider text not null,
  model text not null,
  recording_id uuid,
  unit text not null,
  input_units bigint check (input_units >= 0),
  output_units bigint check (output_units >= 0),
  cost_micros bigint check (cost_micros >= 0),
  succeeded boolean not null default true,
  created_at timestamptz not null default now(),
  constraint model_usage_recording_fk
    foreign key (recording_id, user_id)
    references recordings (id, user_id) on delete set null,
  unique (id, user_id)
);

create index model_usage_user_idx on model_usage (user_id, created_at desc);

-- Row level security ------------------------------------------------------------------
--
-- Same rule as every other user-owned table: deny by default, allow only rows
-- whose user_id is the caller. The helper from the first policy migration was
-- dropped with it, so it is recreated here and dropped again below rather than
-- left behind as a permanent function nobody calls.

create or replace function apply_owner_policies(target_table text)
returns void
language plpgsql
as $function$
begin
  execute format('alter table %I enable row level security', target_table);

  execute format(
    'create policy %I on %I for select to authenticated using (user_id = (select auth.uid()))',
    target_table || '_select', target_table
  );

  execute format(
    'create policy %I on %I for insert to authenticated with check (user_id = (select auth.uid()))',
    target_table || '_insert', target_table
  );

  execute format(
    'create policy %I on %I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
    target_table || '_update', target_table
  );

  execute format(
    'create policy %I on %I for delete to authenticated using (user_id = (select auth.uid()))',
    target_table || '_delete', target_table
  );
end;
$function$;

select apply_owner_policies('recordings');
select apply_owner_policies('transcripts');
select apply_owner_policies('transcript_segments');
select apply_owner_policies('extracted_items');
select apply_owner_policies('class_summaries');
select apply_owner_policies('model_usage');

drop function apply_owner_policies(text);

-- Storage -----------------------------------------------------------------------------
--
-- A bucket of its own, not the documents one: recordings are far larger, follow
-- a different retention rule, and carry audio of other people speaking. Mixing
-- them would mean one policy and one size limit governing both.
--
-- The project wide upload limit still applies on top of the bucket limit,
-- whichever is smaller.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'class-recordings',
  'class-recordings',
  false,
  209715200, -- 200 MiB, about two hours of speech at a normal bitrate
  array[
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'audio/opus',
    'audio/webm',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ownership lives in the object path, exactly as it does for documents: every
-- file sits under a folder named after its owner, and the path is built on the
-- server rather than taken from the client.

create policy class_recordings_read
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'class-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy class_recordings_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'class-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy class_recordings_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'class-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'class-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy class_recordings_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'class-recordings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
