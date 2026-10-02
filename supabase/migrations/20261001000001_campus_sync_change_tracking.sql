-- Keep the latest meaningful change for each synchronized campus item.
--
-- Unchanged syncs update last_seen_at but leave this metadata intact, so the
-- activity screen can still show the most recent real change.
alter table campus_sync_items
  add column last_change_kind text,
  add column last_changed_at timestamptz,
  add constraint campus_sync_items_last_change_kind_valid
    check (last_change_kind is null or last_change_kind in ('new', 'changed')),
  add constraint campus_sync_items_last_change_pair_valid
    check (
      (last_change_kind is null and last_changed_at is null)
      or (last_change_kind is not null and last_changed_at is not null)
    );

create index campus_sync_items_last_changed_idx
  on campus_sync_items (user_id, last_changed_at desc)
  where last_changed_at is not null;
