// Applies every migration to an in-memory Postgres to catch SQL errors before
// they reach a real project. Supabase supplies auth.users and auth.uid(); both
// are stubbed here so the migrations can run unchanged.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

const AUTH_STUB = `
  create schema if not exists auth;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );

  create or replace function auth.uid() returns uuid
  language sql stable
  as $stub$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $stub$;

  do $stub$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role;
    end if;
  end
  $stub$;
`;

async function main() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.error('No migrations found');
    process.exit(1);
  }

  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    try {
      await db.exec(sql);
      console.log(`ok    ${file}`);
    } catch (error) {
      console.error(`FAIL  ${file}`);
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  const tables = await db.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`,
  );
  console.log(`\n${tables.rows.length} tables created`);

  const unprotected = await db.query(
    `select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
     order by c.relname`,
  );

  if (unprotected.rows.length > 0) {
    console.error('\nTables without row level security:');
    for (const row of unprotected.rows) console.error(`  ${row.relname}`);
    process.exit(1);
  }

  console.log('every public table has row level security enabled');
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
