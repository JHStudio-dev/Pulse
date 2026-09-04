// Proves the row level security policies actually isolate students.
//
// Enabling RLS is not the same as enforcing it, so this signs in as one student,
// writes academic data, then reads as another and expects to see nothing. It
// runs as the `authenticated` role because a superuser bypasses RLS entirely.

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

// Only the auth schema is granted here. Access to public must come from the
// migrations themselves: granting it in the harness is exactly what hid the
// missing privileges until the first real deployment.
const GRANTS = `
  grant usage on schema auth to authenticated;
  grant select on auth.users to authenticated;
`;

const failures = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${label} (expected ${expected}, got ${actual})`);
  if (!ok) failures.push(label);
}

async function actAs(db, userId) {
  await db.exec(`set role authenticated;`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false);`);
}

async function asSuperuser(db, sql) {
  await db.exec('reset role;');
  await db.exec(sql);
}

async function main() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);

  const files = (await readdir(migrationsDir)).filter((n) => n.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(await readFile(join(migrationsDir, file), 'utf8'));
  }
  await db.exec(GRANTS);

  // Two students. The trigger provisions a profile row for each.
  const inserted = await db.query(
    `insert into auth.users (email) values ('a@example.test'), ('b@example.test')
     returning id`,
  );
  const [studentA, studentB] = inserted.rows.map((row) => row.id);

  // Student A builds a period, a subject and a task.
  await actAs(db, studentA);
  const period = await db.query(
    `insert into academic_periods (user_id, name, start_date, end_date, time_zone)
     values ($1, 'Period', '2026-03-01', '2026-06-30', 'America/Tegucigalpa')
     returning id`,
    [studentA],
  );
  const periodId = period.rows[0].id;

  const subject = await db.query(
    `insert into subjects (user_id, academic_period_id, name)
     values ($1, $2, 'Fisica I') returning id`,
    [studentA, periodId],
  );
  const subjectId = subject.rows[0].id;

  await db.query(
    `insert into tasks (user_id, subject_id, title, due_date)
     values ($1, $2, 'Informe', '2026-03-20')`,
    [studentA, subjectId],
  );

  const ownSubjects = await db.query('select count(*)::int as n from subjects');
  check('student A sees their own subject', ownSubjects.rows[0].n, 1);

  // Student B must see none of it.
  await actAs(db, studentB);
  const otherSubjects = await db.query('select count(*)::int as n from subjects');
  check('student B cannot read A subjects', otherSubjects.rows[0].n, 0);

  const otherTasks = await db.query('select count(*)::int as n from tasks');
  check('student B cannot read A tasks', otherTasks.rows[0].n, 0);

  const otherPeriods = await db.query('select count(*)::int as n from academic_periods');
  check('student B cannot read A periods', otherPeriods.rows[0].n, 0);

  const otherProfiles = await db.query('select count(*)::int as n from profiles');
  check('student B sees only their own profile', otherProfiles.rows[0].n, 1);

  // Updates and deletes must not reach another student's rows either.
  const updated = await db.query(`update subjects set name = 'hijacked' returning id`);
  check('student B cannot update A subjects', updated.rows.length, 0);

  const deleted = await db.query('delete from tasks returning id');
  check('student B cannot delete A tasks', deleted.rows.length, 0);

  // Writing a row owned by someone else must be rejected by the insert policy.
  let insertBlocked = false;
  try {
    await db.query(
      `insert into academic_periods (user_id, name, start_date, time_zone)
       values ($1, 'Forged', '2026-03-01', 'UTC')`,
      [studentA],
    );
  } catch {
    insertBlocked = true;
  }
  check('student B cannot insert rows owned by A', insertBlocked, true);

  // Reference data stays readable for everyone signed in.
  await asSuperuser(
    db,
    `insert into universities (name, abbreviation, country_code)
     values ('Universidad Nacional Autonoma de Honduras', 'UNAH', 'HN')`,
  );
  await actAs(db, studentB);
  const universities = await db.query('select count(*)::int as n from universities');
  check('reference data is readable by any student', universities.rows[0].n, 1);

  await db.exec('reset role;');
  await db.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} isolation check(s) failed`);
    process.exit(1);
  }
  console.log('\nrow level security isolates student data');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
