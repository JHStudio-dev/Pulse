-- A campus course belongs to one academic period in Pulse.
--
-- The same course code can come back in a later period. That is a new subject
-- with its own tasks and schedule, not the old one revived, so each period now
-- keeps its own link, sync runs and items. Earlier links stay with the period
-- they were made in, history included.
--
-- The link carries its subject's period through a composite key, so the two
-- cannot disagree.

alter table subjects
  add constraint subjects_id_period_user_key unique (id, academic_period_id, user_id);

alter table campus_subject_links add column academic_period_id uuid;

update campus_subject_links as link
set academic_period_id = subject.academic_period_id
from subjects as subject
where subject.id = link.subject_id
  and subject.user_id = link.user_id;

alter table campus_subject_links
  alter column academic_period_id set not null,
  add constraint campus_subject_links_subject_period_fk
    foreign key (subject_id, academic_period_id, user_id)
    references subjects (id, academic_period_id, user_id)
    on delete cascade
    on update cascade;

drop index campus_subject_links_external_idx;

create unique index campus_subject_links_external_idx
  on campus_subject_links (
    user_id,
    campus_connection_id,
    academic_period_id,
    external_course_id,
    coalesce(external_session_id, '')
  );
