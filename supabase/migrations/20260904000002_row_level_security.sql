-- Row level security.
--
-- Every user-owned table denies access by default and allows only rows whose
-- user_id matches the caller. Because child tables carry user_id enforced by a
-- composite foreign key, no policy needs a subquery to reach its parent.
--
-- Reference tables (universities, campus_instances) are readable by any signed
-- in user and writable only by the service role, which bypasses RLS.

-- Reference data ---------------------------------------------------------------

alter table universities enable row level security;
alter table campus_instances enable row level security;

create policy universities_read
  on universities for select
  to authenticated
  using (true);

create policy campus_instances_read
  on campus_instances for select
  to authenticated
  using (true);

-- Helper: applies the standard owner policy set to a user-owned table.
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

-- User-owned tables -------------------------------------------------------------

select apply_owner_policies('campus_connections');
select apply_owner_policies('academic_periods');
select apply_owner_policies('subjects');
select apply_owner_policies('subject_schedules');
select apply_owner_policies('class_sessions');
select apply_owner_policies('attendance');
select apply_owner_policies('tasks');
select apply_owner_policies('task_items');
select apply_owner_policies('grade_categories');
select apply_owner_policies('assessments');
select apply_owner_policies('grades');
select apply_owner_policies('documents');
select apply_owner_policies('notes');
select apply_owner_policies('inbox_items');
select apply_owner_policies('recovery_plans');
select apply_owner_policies('recovery_items');
select apply_owner_policies('reminders');
select apply_owner_policies('notifications');

-- Profiles key on user_id rather than a separate owner column.

alter table profiles enable row level security;

create policy profiles_select
  on profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_insert
  on profiles for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_update
  on profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop function apply_owner_policies(text);

-- Profile provisioning -----------------------------------------------------------

-- A signed up user needs a profile row before any screen can read preferences.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
