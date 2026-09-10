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

## Phase 2 — Classes and recovery

**In progress.** Class Mode, attendance, markers, session notes and Recovery
Mode are built and tested against real data in the development project.

Delivered:

- [x] `class_markers` table, deployed through the GitHub integration
- [x] Class Mode: subject, professor, schedule, timer, quick note field and the
      five marks — Nota, Duda, Importante, Tarea, Me perdí
- [x] Each mark stores the minute of the class it belongs to, so the moment can
      be found again
- [x] Session notes: one note per class, rewritten in place
- [x] Attendance: attended, partial, missed, cancelled, with an optional note
- [x] Recovery Mode: a missed or partly attended class opens a plan with its
      steps, ticked one by one, and the plan status follows the steps —
      pending, recovering, recovered
- [x] Correcting attendance to a class that was attended removes an untouched
      plan; a plan with progress on it is the student's own work and stays
- [x] Row level security isolation covers markers, attendance, recovery plans
      and recovery steps

Remaining in this phase:

- [ ] Optional attention check-in. Deliberately not built yet: the
      specification is explicit that Class Mode is not surveillance and that a
      non-response must not be asserted as distraction, so the interaction
      needs a design decision before code.
- [ ] Class Mode has no dedicated full-screen layout. The session screen is
      reduced, but it still sits inside the normal application shell.
- [ ] Recovery plans have no screen of their own. They are reachable from the
      class they belong to, not from a list of everything pending.

The timer holds at the class length once the class is over, so an old session
does not show a clock that has been running for days. Before the class starts it
shows the countdown instead of a zeroed timer.

## Later phases

Unchanged from the specification, and not to be started early:

| Phase | Scope |
|---|---|
| 1.5 | Campus Sync integration, Review Changes, first connectors |
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
