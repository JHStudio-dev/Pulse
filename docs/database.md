# Database

PostgreSQL through Supabase. Migrations are in `supabase/migrations`.

## Ownership and access

Every user-owned table carries `user_id`. Child tables carry it too and
reference their parent with a **composite foreign key** `(id, user_id)`:

```sql
constraint subject_schedules_subject_fk
  foreign key (subject_id, user_id) references subjects (id, user_id)
```

The parent has a matching `unique (id, user_id)`. This makes the denormalized
`user_id` impossible to drift from its parent — a schedule cannot point at
another student's subject — and it keeps every policy a plain check:

```sql
using (user_id = (select auth.uid()))
```

No policy needs a subquery to reach a parent table. `select auth.uid()` is
wrapped so the planner evaluates it once per query rather than per row.

`universities` and `campus_instances` are shared reference data: readable by any
signed-in user, writable only by the service role.

## Tables

| Group | Tables |
|---|---|
| Identity | `profiles` |
| Institutions | `universities`, `campus_instances`, `campus_connections` |
| Academic | `academic_periods`, `subjects`, `subject_schedules`, `class_sessions`, `attendance`, `class_markers` |
| Work | `tasks`, `task_items`, `assessments`, `grade_categories`, `grades` |
| Content | `documents`, `notes`, `inbox_items` |
| Recovery | `recovery_plans`, `recovery_items` |
| Recordings | `recordings`, `transcripts`, `transcript_segments`, `extracted_items`, `class_summaries`, `model_usage` |
| Alerts | `reminders`, `notifications` |

Deliberately **not** created yet, because their phases have not started:
`study_sessions`, `campus_sync_runs`, `campus_changes`. The specification lists
them; building tables for unbuilt features only invites schema churn.

## Decisions worth knowing

- **Modality is per session.** `class_sessions.modality` overrides the subject
  default. A normally in-person subject can hold one virtual class without
  editing the recurring schedule. `unconfirmed` is a real value, not a null.
- **Sessions override their schedule** rather than mirroring it. A one-off room
  change touches the session only.
- **Times are `time`, dates are `date`.** Instants are derived from the period's
  timezone in `packages/core`, not stored per row.
- **Documents keep history.** `replaces_document_id` links a campus file to the
  version it superseded, and `content_hash` supports duplicate detection.
- **A recording carries why it is allowed.** `permission` and
  `permission_confirmed_at` are written per recording and never defaulted from a
  previous answer, because Pulse only processes audio the student may record or
  use. There is no covert or automatic capture anywhere in the product.
- **Recording duration is reported by the browser**, which is the only side that
  can read it without decoding the file. A check constraint bounds it at two
  hours and the column is nullable, since a browser cannot always read it. Size
  and type are enforced by the bucket, which the client cannot talk its way past.
- **Nothing in the pipeline names a provider.** `provider` and `model` are free
  text on `transcripts`, `class_summaries` and `model_usage`, so replacing a
  transcription service is a configuration change rather than a migration.
- **Extracted items are claims, not facts.** They stay `detected` until the
  student confirms them, and only a confirmed one may point at a real task or
  assessment. `confidence` and `corroborated_by` inform that review; neither
  decides it.
- **Recordings live in their own bucket.** `class-recordings` is private, capped
  at 200 MiB, and accepts only audio and video types. Keeping it separate from
  `documents` means one retention rule and one size limit do not have to serve
  both.
- **A marker belongs to a moment of a class.** `class_markers.offset_seconds`
  stores how far into the session the student marked it, not a wall clock time,
  so the point survives a session being rescheduled and lines up with a
  recording later.
- **A reminder has exactly one target**, enforced by a check constraint against
  `target_kind`. `departure` is distinct from `start` because an in-person class
  needs a leave-now reminder offset by travel time.
- **A profile row is created on signup** by a trigger on `auth.users`, so no
  screen has to handle a missing profile.

## Applying migrations

Requires the Supabase CLI and a linked project:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Reference institutions need no separate step: UJCV and UNAH ship in an
idempotent migration, so any environment gets them when migrations run.

The campus base URLs there are **unconfirmed placeholders**. Replace them with
the real hosts recorded during the Campus Sync spike before pointing any
connector at them.

## Reference data vs seed

The two are deliberately separate:

- **Canonical reference data** — universities and campus instances — lives in a
  migration. Every environment needs it, and the GitHub integration does not run
  seed files when deploying to `main`.
- **`supabase/seed/demo.sql`** holds throwaway local data and runs only on
  `supabase db reset`. It is empty until there are screens to populate.

Never copy reference data into the seed. Two sources of truth for the same rows
drift the moment one is edited.

## Checking changes

```bash
npm run db:check
```

This applies every migration to an in-memory Postgres and then runs an isolation
test: two students are created, one writes data, and the other must not be able
to read, update, delete, or forge ownership of it. Run it after any schema
change — a policy that is enabled but wrong looks identical to one that works
until someone checks.
