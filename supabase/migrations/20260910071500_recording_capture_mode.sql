-- How a recording was captured, and what it actually contains.
--
-- The three modes are not interchangeable downstream. A virtual class is
-- captured from a browser surface the student picks and arrives as video; an
-- in-person class is microphone audio with no video at all; an upload is a file
-- whose contents Pulse did not produce and cannot assume anything about.
--
-- Transcription must never be handed a video file. For a virtual recording the
-- audio is extracted first and `audio_storage_path` points at it; for the other
-- two modes the stored file is already audio, or is whatever the student
-- uploaded. `transcriptionSourcePath` in the domain applies that rule.

create type recording_capture as enum ('virtual_meeting', 'in_person_audio', 'upload');

alter table recordings
  -- Defaulted only so the column can be added; every insert states it, which is
  -- why the default is dropped immediately below.
  add column capture_mode recording_capture not null default 'upload',
  -- What the capture actually produced. A browser may hand back display video
  -- with no tab or system audio at all, and that has to be recorded rather than
  -- assumed, because it decides whether the recording can be transcribed and
  -- what the student was told at the time.
  add column has_video boolean not null default false,
  add column has_system_audio boolean not null default false,
  add column has_microphone boolean not null default false,
  -- The audio track pulled out of a video recording. Null until extraction runs,
  -- and null forever for modes that are already audio.
  add column audio_storage_path text unique,
  add column audio_extracted_at timestamptz;

alter table recordings alter column capture_mode drop default;

alter table recordings
  -- An in-person class is microphone audio. Video there would mean something
  -- captured the room, which is not what this mode is.
  add constraint recordings_in_person_has_no_video
    check (capture_mode <> 'in_person_audio' or has_video = false),
  -- A capture with no audio source can never be transcribed. Uploads are exempt:
  -- Pulse did not make the file and cannot claim what is inside it.
  add constraint recordings_capture_has_audio
    check (capture_mode = 'upload' or has_system_audio or has_microphone),
  -- Extraction either happened, with both a path and a time, or it did not.
  add constraint recordings_audio_extraction_complete
    check ((audio_storage_path is null) = (audio_extracted_at is null));

create index recordings_capture_idx on recordings (user_id, capture_mode);

comment on column recordings.capture_mode is
  'How the recording was produced: browser display capture, microphone, or a file the student uploaded.';
comment on column recordings.has_system_audio is
  'Whether the captured display stream carried tab or system audio. False is common and expected on some browsers.';
comment on column recordings.audio_storage_path is
  'Audio extracted from a video recording. Transcription reads this, never the video.';
