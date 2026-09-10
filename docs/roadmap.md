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

**Complete.** Closed September 2026, after verifying Class Mode, markers,
session notes, attendance and Recovery Mode against real data in the development
project. Every row written during that verification was removed afterwards, so
the account holds only the seeded demo dataset.

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

The timer holds at the class length once the class is over, so an old session
does not show a clock that has been running for days. Before the class starts it
shows the countdown instead of a zeroed timer.

Verification at close: format, lint, typecheck, 111 unit tests, migration
application and 23 row level security isolation checks all passing; production
build succeeds.

### Known gaps, none blocking

- **The optional attention check-in is not built.** The specification asks for
  one that is discreet and optional, and is equally explicit that Class Mode is
  not surveillance and that a non-response must never be asserted as
  distraction. Building it means deciding first what a non-response is allowed
  to mean and how the student turns it off, which is a product decision rather
  than a coding one. Recorded here as a future Class Mode enhancement, not as
  unfinished work.
- Class Mode has no dedicated full-screen layout. The session screen is reduced,
  but it still sits inside the normal application shell.
- Recovery plans have no screen of their own. They are reachable from the class
  they belong to, not from a list of everything still pending.
- A plan reaches **recovered** only by ticking every step. There is no separate
  "mark as recovered" action, so a student who considers a class recovered
  without doing every step has to tick them anyway.
- Notes are reachable from the class they belong to. The repository also lists
  notes per subject, but no screen uses that yet, so there is no place to read
  a subject's notes together.
- A marker cannot be edited, only added and removed.
- The marker offset comes from the browser clock, since only the browser knows
  how long the screen has been open. It is clamped server side so a bad value
  cannot land outside the day, but it is not independently verifiable.

## Phase 2.5A — Class recording foundation

**Complete.** The storage and lifecycle a later pipeline will read from, with no
model work in it. Nothing here transcribes, summarises or extracts anything.

Delivered:

- [x] Full Phase 2.5 data model: `recordings`, `transcripts`,
      `transcript_segments`, `extracted_items`, `class_summaries`,
      `model_usage`, all with row level security
- [x] A private `class-recordings` bucket of its own, 200 MiB, audio and video
      types only, with the same owner-folder policies as documents
- [x] Three capture modes, stored explicitly as `capture_mode`, because what
      produced a recording changes what later stages may assume:
      - **Clase virtual** — browser display capture of the tab, window or
        screen the student picks, with meeting audio when the browser offers
        it and the microphone optionally mixed in
      - **Clase presencial** — microphone audio, no video
      - **Archivo subido** — a file Pulse did not produce
- [x] The capture surface is always chosen by the student in the browser's own
      dialog. Pulse never picks it and never starts a recording on its own
- [x] What the capture actually produced is recorded, not assumed:
      `has_video`, `has_system_audio`, `has_microphone`
- [x] A display capture that comes back without meeting audio says so plainly,
      both while recording and on the saved recording
- [x] A capture with no audio at all is refused rather than saved as a silent
      video that could never be transcribed
- [x] Transcription reads extracted audio, never a video file:
      `audio_storage_path` plus the `transcriptionSourcePath` rule in the domain
- [x] Upload from the class screen, tied to a real session owned by the caller
- [x] Explicit permission confirmation per recording, refused on the server as
      well as in the form, and stored with its timestamp
- [x] Size and type enforced by the bucket; duration bounded at 120 minutes
- [x] Playback through signed URLs that live five minutes and are issued on
      request, never rendered into the page
- [x] Deletion of the row and the stored file together, and cleanup of the
      uploaded object when the row fails to save
- [x] Recording lifecycle as domain rules — which transitions are legal, when a
      failed recording may be retried — so a background worker and the web app
      agree without sharing code
- [x] Empty, reading, error and per-status states in the interface

Verified end to end against the development project: upload, metadata, session
association, listing, signed playback of the exact bytes, and deletion leaving
neither a row nor an object behind — with a temporary WAV, and again with a
WebM that MediaRecorder produced in the browser and that was saved as a virtual
class capture.

### Known gaps, none blocking

- **The browser capture dialogs were not exercised end to end.**
  `getDisplayMedia` and `getUserMedia` open permission prompts that browser
  automation cannot drive, so the two direct capture modes need one manual pass
  on a real machine. Everything either side of them was verified: the recorder
  itself produces a real WebM, the capture metadata persists, and the server
  refuses every inconsistent combination.
- **Native capture is not built.** A phone recording app is Phase 5; the schema
  and the capture mode already accommodate it.
- **Duration is whatever the browser reports.** Some browsers never load
  metadata for a local file and answer with neither a length nor an error, so
  the field is nullable and the form says when it could not be read. Only size
  and type are enforced independently of the client.
- **A long capture is held in memory until it stops.** MediaRecorder chunks
  accumulate in the tab, so a two hour virtual class is a large buffer before
  anything is uploaded. Chunked upload while recording is the fix, and it is not
  built.
- Audio extraction from a video recording is not implemented. The column, the
  constraint and the domain rule that decides what transcription reads are all
  in place; the extraction step belongs to Phase 2.5B.
- Nothing moves a recording past `uploaded` yet. The queue columns, the status
  flow and the retry rule exist; the worker that uses them is Phase 2.5B.
- Retention is "keep everything". `retain` and `delete_after` are the hooks a
  configurable policy will set, and the specification requires that policy to
  exist before a public beta.
- The project wide upload limit applies on top of the 200 MiB bucket limit,
  whichever is smaller. It has not been raised or measured.

## Later phases

Unchanged from the specification, and not to be started early:

| Phase | Scope |
|---|---|
| 1.5 | Campus Sync integration, Review Changes, first connectors |
| 2.5B | Transcription, segments, summaries, extracted items, review, Campus Sync crosscheck |
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
