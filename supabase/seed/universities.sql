-- Reference institutions for the pilot.
--
-- Institution specifics belong in data, not in application branches. Adding a
-- university later means another row here plus a connector, never a change to
-- domain logic.
--
-- The base_url values below are unconfirmed placeholders. Replace them with the
-- real campus hosts recorded during the Campus Sync feasibility spike before
-- pointing any connector at them.

insert into universities (name, abbreviation, country_code)
values
  ('Universidad Jose Cecilio del Valle', 'UJCV', 'HN'),
  ('Universidad Nacional Autonoma de Honduras', 'UNAH', 'HN')
on conflict (abbreviation) do nothing;

insert into campus_instances (university_id, name, platform, base_url, settings)
select u.id, 'Campus UJCV', 'chamilo', 'https://campus.ujcv.edu.hn', '{}'::jsonb
from universities u
where u.abbreviation = 'UJCV'
  and not exists (
    select 1 from campus_instances c
    where c.university_id = u.id and c.name = 'Campus UJCV'
  );

insert into campus_instances (university_id, name, platform, base_url, settings)
select u.id, 'Campus UNAH', 'moodle', 'https://campusvirtual.unah.edu.hn', '{}'::jsonb
from universities u
where u.abbreviation = 'UNAH'
  and not exists (
    select 1 from campus_instances c
    where c.university_id = u.id and c.name = 'Campus UNAH'
  );
