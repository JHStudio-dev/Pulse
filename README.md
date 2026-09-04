# Pulse

Multi-university academic management product, developed by Scale Studio.

Pulse exists to reduce the chance that a student misses important academic
information — classes, schedules, tasks, deadlines, assessments, attendance,
grades and academic risk.

## Status

Phase 0 complete: architecture, shared types, domain logic, database schema with
row level security, and an installable PWA shell. No product screens yet.

Phase 0.1 in progress: the Campus Sync feasibility spike is built but needs to
be run against real UJCV and UNAH accounts. See [docs/roadmap.md](docs/roadmap.md).

## Scope

Initial validation targets are UJCV and UNAH, with Chamilo and Moodle as the
first LMS integration targets. University-specific configuration and
LMS-specific logic are kept separate — Pulse is not built around a single
university or platform.

## Structure

```text
apps/web/                  Next.js app, App Router, PWA base
packages/types/            Shared academic types
packages/validation/       Zod input schemas
packages/core/             Domain logic, framework independent
packages/database/         Data access ports and Supabase adapter
experiments/campus-sync/   Feasibility spike, outside the build
supabase/                  Migrations, seed, schema checks
docs/                      Architecture, database, roadmap
```

Core academic logic stays independent from Next.js, Supabase, specific LMS
platforms and specific model providers.

## Getting started

Requires Node 22 or newer.

```bash
npm install
cp .env.example .env.local   # fill in from your Supabase project
npm run dev --workspace @pulse/web
```

## Checks

```bash
npm run check      # format, lint, typecheck, tests, schema checks
npm run test       # unit tests
npm run db:check   # migrations plus row level security isolation test
```

## Documentation

- [Architecture](docs/architecture.md) — layout, boundaries, time handling
- [Database](docs/database.md) — schema, ownership model, migrations
- [Roadmap](docs/roadmap.md) — phase status

Product requirements and repository rules are maintained locally in `docs/` and
are not tracked in this repository.
