-- A campus task the student deleted stays deleted.
--
-- Deleting the task clears applied_task_id through its foreign key, which on
-- its own looks exactly like a task that was never created. The student's
-- decision is recorded on the campus item instead, so a later sync can keep
-- the item, follow its changes and still not recreate the task.
alter table campus_sync_items
  add column dismissed_at timestamptz,
  add constraint campus_sync_items_dismissed_kind_valid
    check (dismissed_at is null or kind = 'assignment');

create index campus_sync_items_dismissed_idx
  on campus_sync_items (user_id)
  where dismissed_at is not null;
