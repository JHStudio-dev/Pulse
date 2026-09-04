# Roadmap

Phase status. The detailed roadmap in the specification takes priority if this
summary falls behind.

## Phase 0 — Foundation and architecture

**Done.**

- Monorepo, npm workspaces, TypeScript, ESLint, Prettier, Vitest
- `packages/types` — shared academic types, no dependencies
- `packages/validation` — Zod input schemas
- `packages/core` — time, schedule recurrence, grades, task priority, academic
  risk, recovery planning, with tests
- `packages/database` — repository ports, Supabase adapter, row mappers
- `supabase/` — schema, row level security, seed, migration and isolation checks
- `apps/web` — Next.js shell, PWA manifest and service worker
- Documentation to start development

Not started, deliberately: `packages/ui` (nothing to put in it yet) and the
remaining repository implementations (added as Phase 1 needs them).

## Phase 0.1 — Campus Sync feasibility

**Instrument built, results pending.**

`experiments/campus-sync/` can probe UJCV/Chamilo and UNAH/Moodle for courses,
assignments, due dates, materials, file access and announcements. It is outside
the build and imported by nothing.

Still to do — this needs a real account and cannot be completed from the
repository alone:

- [ ] Run the Moodle probe against UNAH with a beta tester's own token
- [ ] Run the Chamilo probe against UJCV and record whether REST is enabled
- [ ] Write up both findings, personal details removed
- [ ] Decide the mechanism per platform, or record the fallback

**Phase 1.5 should not be designed until these findings exist.** The
specification is explicit that Campus Sync is both a core capability and the
largest technical risk.

## Phase 1 — Pulse Core / MVP

Not started. Auth, academic period, subjects, schedules, sessions by modality,
dashboard, tasks, calendar, documents, quick capture, internal reminders,
onboarding, responsive, installable PWA, demo data.

## Later phases

Unchanged from the specification, and not to be started early:

| Phase | Scope |
|---|---|
| 1.5 | Campus Sync integration, Review Changes, first connectors |
| 2 | Class Mode, attendance, markers, Recovery Mode |
| 2.5 | Recording, transcription, class processing |
| 3 | Assessments, grade calculation, simulator, risk, day plan |
| 3.5 | Ask, document search, RAG per subject |
| 4 | Study tools, Web Push, grouped email, quiet hours, calendar sync |
| 5 | Native mobile via Capacitor |
| 6 | Desktop companion, browser agent fallback |

## Open decisions

Carried from the specification, none blocking:

- Visual identity: logo, palette, graphic system. The current app uses neutral
  tokens and a placeholder mark, not a brand.
- Production domain and subdomains
- Transactional email and notification providers
- Exact integration method per campus — this is what Phase 0.1 answers
- Native distribution once there is real usage
