-- Explicit privileges for the API roles.
--
-- Supabase normally hands these out through default privileges, but those only
-- cover objects created by the role that owns the rule. The GitHub integration
-- applies migrations with a different role, so the tables from the initial
-- migration ended up unreachable: has_table_privilege returned false for anon,
-- authenticated and service_role alike, and PostgREST answered 42501.
--
-- Granting explicitly keeps access independent of which role runs a migration.
-- Row level security still decides which rows each role sees; these grants only
-- make the tables reachable at all.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- Anything created later inherits the same access.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- Pin the search path on both functions.
--
-- Without it a caller controlled schema could shadow an unqualified name. This
-- matters most for handle_new_user, which runs as security definer.

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

-- These are trigger functions. Nothing should be able to call them over the
-- API, and handle_new_user runs as security definer, so exposing it through
-- /rest/v1/rpc/ would let any caller invoke it with elevated rights.
revoke execute on function set_updated_at() from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;
