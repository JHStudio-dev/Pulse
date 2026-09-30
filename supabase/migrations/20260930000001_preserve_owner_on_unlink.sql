-- Preserve ownership when nullable child references are detached.
-- Composite keys still enforce (record_id, user_id) ownership, but delete
-- must clear only the nullable reference, never the required user_id.

alter table class_sessions
  drop constraint class_sessions_schedule_fk,
  add constraint class_sessions_schedule_fk
    foreign key (subject_schedule_id, user_id)
    references subject_schedules (id, user_id)
    on delete set null (subject_schedule_id);

alter table tasks
  drop constraint tasks_subject_fk,
  add constraint tasks_subject_fk
    foreign key (subject_id, user_id)
    references subjects (id, user_id)
    on delete set null (subject_id);

alter table assessments
  drop constraint assessments_category_fk,
  add constraint assessments_category_fk
    foreign key (grade_category_id, user_id)
    references grade_categories (id, user_id)
    on delete set null (grade_category_id);

alter table assessments
  drop constraint assessments_session_fk,
  add constraint assessments_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id)
    on delete set null (class_session_id);

alter table documents
  drop constraint documents_subject_fk,
  add constraint documents_subject_fk
    foreign key (subject_id, user_id)
    references subjects (id, user_id)
    on delete set null (subject_id);

alter table documents
  drop constraint documents_session_fk,
  add constraint documents_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id)
    on delete set null (class_session_id);

alter table documents
  drop constraint documents_replaces_fk,
  add constraint documents_replaces_fk
    foreign key (replaces_document_id, user_id)
    references documents (id, user_id)
    on delete set null (replaces_document_id);

alter table notes
  drop constraint notes_subject_fk,
  add constraint notes_subject_fk
    foreign key (subject_id, user_id)
    references subjects (id, user_id)
    on delete set null (subject_id);

alter table notes
  drop constraint notes_session_fk,
  add constraint notes_session_fk
    foreign key (class_session_id, user_id)
    references class_sessions (id, user_id)
    on delete set null (class_session_id);

alter table notifications
  drop constraint notifications_reminder_fk,
  add constraint notifications_reminder_fk
    foreign key (reminder_id, user_id)
    references reminders (id, user_id)
    on delete set null (reminder_id);

alter table inbox_items
  drop constraint inbox_items_subject_fk,
  add constraint inbox_items_subject_fk
    foreign key (subject_id, user_id)
    references subjects (id, user_id)
    on delete set null (subject_id);

alter table extracted_items
  drop constraint extracted_items_segment_fk,
  add constraint extracted_items_segment_fk
    foreign key (transcript_segment_id, user_id)
    references transcript_segments (id, user_id)
    on delete set null (transcript_segment_id);

alter table extracted_items
  drop constraint extracted_items_task_fk,
  add constraint extracted_items_task_fk
    foreign key (confirmed_task_id, user_id)
    references tasks (id, user_id)
    on delete set null (confirmed_task_id);

alter table extracted_items
  drop constraint extracted_items_assessment_fk,
  add constraint extracted_items_assessment_fk
    foreign key (confirmed_assessment_id, user_id)
    references assessments (id, user_id)
    on delete set null (confirmed_assessment_id);

alter table class_summaries
  drop constraint class_summaries_transcript_fk,
  add constraint class_summaries_transcript_fk
    foreign key (transcript_id, user_id)
    references transcripts (id, user_id)
    on delete set null (transcript_id);

alter table model_usage
  drop constraint model_usage_recording_fk,
  add constraint model_usage_recording_fk
    foreign key (recording_id, user_id)
    references recordings (id, user_id)
    on delete set null (recording_id);

