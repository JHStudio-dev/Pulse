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

**Phase 1.5 remains externally blocked and must not be designed until real
extraction is validated.** Closing Phase 1 does not unblock it: the blockers are
enrollment and tester availability, not engineering capacity.

One conclusion already holds: UJCV needs the Campus Companion over the student
session, because an API-key worker is not possible without administrator action.

To resume, either of these is enough to restart the spike:

- The UJCV account gains at least one enrolled course.
- A UNAH student runs the Moodle probe on their own session.

## Phase 1 — Pulse Core / MVP

**Complete.** Closed September 2026, after manual testing of the running
product against real data in the development project.

Delivered:

- [x] Email and password authentication, with email confirmation
- [x] First-user onboarding
- [x] Academic periods, editable after onboarding
- [x] University selection, stored as a campus connection
- [x] Subjects with academic context, created through a dialog
- [x] Subject schedules: weekly slots per subject
- [x] Class sessions generated from schedules, per-session modality
- [x] Authenticated application shell with scalable navigation
- [x] Dashboard: next class with countdown, today's schedule, due tasks, real
      attention signals
- [x] Tasks: quick capture, edit, complete, computed priority, overdue state
- [x] Calendar: month grid and agenda over classes and task deadlines
- [x] Documents: private storage, upload, list, signed-URL open, delete
- [x] Quick Capture and Inbox: global capture, raw text preserved verbatim,
      convert to task
- [x] Internal reminders: task and class reminders, due and upcoming states
- [x] Demo data: seed and cleanup scripts under `scripts/`

Verification at close: format, lint, typecheck, 110 unit tests, migration
application and row level security isolation all passing; production build
succeeds.

### Known gaps, none blocking

Behaviour that is absent or deliberately limited, recorded so it is not
rediscovered as a surprise:

- A subject cannot be edited or archived from the interface, though the
  repository supports both.
- The chosen university cannot be changed after onboarding.
- There is no password recovery flow.
- Quick Capture cannot create a standalone reminder. The schema requires every
  reminder to target an existing session, task or assessment, so reminders are
  created from a task or a class instead, which is where they belong.
- Reminder delivery is in-app only. Scheduling is separate from delivery, so
  push, email or another channel can be added without touching the academic
  model. No external channel exists, and none is implied in the interface.
- Assessment reminders are supported by the schema but have no screen, since
  assessments belong to Phase 3.
- **The PWA has not been verified on a real device.** The manifest and service
  worker exist and the app builds and serves them, but installing to an iPhone
  home screen — the pilot's actual distribution route — has never been tested.
- The app icons are placeholder marks, because the visual identity is still an
  open decision.

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
