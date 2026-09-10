-- Lets a captured item be filed under a subject before it is organised.
--
-- The composite foreign key matches the rest of the schema: it makes the
-- denormalized user_id impossible to drift from the subject's owner, so the
-- table's policies stay a plain user_id = auth.uid() check.
--
-- Nullable on purpose. Quick Capture must stay fast, and the whole point of the
-- inbox is accepting text before deciding where it belongs.

alter table inbox_items
  add column subject_id uuid,
  add constraint inbox_items_subject_fk
    foreign key (subject_id, user_id) references subjects (id, user_id) on delete set null;

create index inbox_items_subject_idx on inbox_items (subject_id);
