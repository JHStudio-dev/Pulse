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

**Not complete. Blocked on external availability, not on engineering.**

Full status in [campus-sync.md](campus-sync.md).

UJCV / Chamilo — partially validated:

- [x] Authenticated access verified
- [x] Private campus access verified
- [x] REST API detected
- [x] Student API key confirmed unavailable
- [ ] Course, material and task extraction — **pending active enrollment**

UNAH / Moodle:

- [ ] Connector feasibility — **requires a real student session**

External blockers, neither solvable by writing code:

1. The UJCV account has no active enrolled courses yet.
2. No UNAH Moodle beta tester is available.

The spike stays in place and does not need rebuilding. Synthetic fixtures may be
used for contract tests, normalization, duplicate detection and parsing, but
never as evidence of real-campus validation.

**Phase 1.5 still should not be designed until real extraction is validated.**
One conclusion already holds: UJCV needs the Campus Companion over the student
session, because an API-key worker is not possible without administrator action.

## Phase 1 — Pulse Core / MVP

**In progress — foundation only.**

Current scope: email/password authentication, first-user onboarding, academic
periods, university selection, subject creation, subject schedules, and an
authenticated application shell.

Not yet in scope for this pass: class sessions, dashboard, tasks, calendar,
documents, quick capture, reminders, demo data.

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
