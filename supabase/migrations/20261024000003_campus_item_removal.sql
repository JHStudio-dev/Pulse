-- When the campus stops listing an item.
--
-- Set only after a complete read of the item's section came back without it,
-- and cleared if it shows up again. A section that could not be read leaves
-- this untouched, so a read failure is never taken for a deletion. Nothing in
-- Pulse is deleted because of it; the item is only marked.
alter table campus_sync_items
  add column removed_at timestamptz;
