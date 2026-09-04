# Architecture

How the repository is laid out and where the boundaries are. Product decisions
live in the specification; this file only covers structure.

## Layout

```text
apps/web/                  Next.js app, App Router, PWA base
packages/types/            Shared academic types. No dependencies.
packages/validation/       Zod schemas for input arriving from users or campuses
packages/core/             Domain logic. Framework and infrastructure free.
packages/database/         Data access ports plus the Supabase adapter
experiments/campus-sync/   Phase 0.1 spike, outside the build
supabase/                  Migrations, seed data, schema checks
```

`packages/ui` is not created yet. There are no shared components to put in it,
and the rules are explicit about not building abstractions before they are
needed.

## Dependency direction

```text
apps/web  →  core, validation, database, types
database  →  types, validation
core      →  types
validation→  types
types     →  nothing
```

Two rules keep this honest:

- **`packages/core` never imports Supabase.** Academic logic — schedules, grades,
  priority, risk, recovery — is pure and testable without a database. Supabase is
  infrastructure, not the product.
- **Nothing above `packages/database` sees PostgREST.** Queries return domain
  objects; driver errors become `DatabaseError`.

That is what makes a move to a self-hosted PostgreSQL a change to one package
rather than a rewrite.

## Data access

`packages/database/src/ports` declares what storage must provide.
`packages/database/src/supabase` implements it. `createSubjectRepository` is the
reference: query, translate the error, map rows to domain objects. The remaining
repositories follow that shape as Phase 1 needs them.

Row mapping is kept pure and separate from queries, because that is where the
awkward parts live — a Postgres `time` arrives as `HH:MM:SS`, and a location is
three flat columns the domain sees as one object.

## Time handling

The single most error-prone area, so it is worth stating plainly:

- A **schedule** repeats at a local wall-clock time (`Monday 08:00`).
- A **session** happens at a real instant.
- Converting between them needs the zone offset *at that moment*.

`packages/core/src/time/zone.ts` does this with `Intl`, no dependency. Honduras
has no daylight saving, but the conversion is tested against a zone that does
(`America/New_York`), including a wall-clock time that the spring-forward gap
skips entirely. The pilot must not bake in an assumption that only holds for
Tegucigalpa.

Every academic period carries its own IANA timezone.

## Language

Domain code returns **codes and numbers, never display text**. Task priority
returns `{ code: 'overdue', value: 3 }`, not "3 days overdue". Wording and
translation belong to the interface. This keeps a UI language decision out of
framework-independent logic.

## Campus Sync

Nothing campus-specific exists in the app yet, by design. The Phase 0.1 spike in
`experiments/campus-sync/` is outside the workspaces, has no dependencies, and
is imported by nothing. See its own README.

When the real connector arrives in Phase 1.5, institution differences live in
configuration and adapters. Never in a branch on university name.

## Checks

```bash
npm run check      # format, lint, typecheck, tests, schema checks
npm run test       # unit tests
npm run db:check   # applies migrations to an in-memory Postgres and tests RLS
```

`npm run db:check` runs the migrations against pglite and then verifies that one
student genuinely cannot read, update, insert or delete another student's rows.
Enabling row level security and enforcing it are not the same thing.
