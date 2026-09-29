-- Links imported campus items to the Pulse records created from them.

alter table campus_sync_items
  add column applied_task_id uuid,
  add column applied_document_id uuid;

alter table campus_sync_items
  add constraint campus_sync_items_applied_task_fk
    foreign key (applied_task_id, user_id)
    references tasks (id, user_id) on delete set null (applied_task_id),
  add constraint campus_sync_items_applied_document_fk
    foreign key (applied_document_id, user_id)
    references documents (id, user_id) on delete set null (applied_document_id),
  add constraint campus_sync_items_applied_target_valid check (
    (kind = 'assignment' and applied_document_id is null)
    or (kind = 'document' and applied_task_id is null)
    or (kind in ('announcement', 'event') and applied_task_id is null and applied_document_id is null)
  );

create index campus_sync_items_applied_task_idx
  on campus_sync_items (applied_task_id)
  where applied_task_id is not null;

create index campus_sync_items_applied_document_idx
  on campus_sync_items (applied_document_id)
  where applied_document_id is not null;
