# Campus Sync — status

What is known about Campus Sync, kept in three separate groups: what a real
campus confirmed, what only automated tests cover, and what still needs a
person with a campus session to check. A test passing never moves an item into
the first group.

Detailed run output lives in `experiments/campus-sync/findings/`, which is
gitignored because a real run contains course names.

## UJCV / Chamilo

Campus is Chamilo 1.x, branded "UJCVx". UJCV is served by Campus Companion, a
browser extension that reads the campus through the student's own signed-in
tab. Pulse never handles a campus password.

### Confirmed on the real campus

| Item | Evidence |
|---|---|
| Authenticated access with the student's session | probe run, September 2026 |
| REST API exists but is closed to students | probe run: a session cookie does not unlock `v2.php`, and an `api_key` is only minted from the password |
| Pages of an enrolled course can be read | real pages from one enrolled course were captured on 2026-09-28 and are kept as fixtures |

The captured pages cover the documents table and a nested folder, the
assignment list and an assignment page, the announcement list and an
announcement page, and the agenda list. Parsers are tested against them, so
these shapes are known to be what UJCV served at that time.

**Consequence:** UJCV cannot be served by an API-key worker unless the campus
administrator enables student API keys. Campus Companion over the student's
own session is the mechanism.

### Covered by automated tests only

Fixtures and in-memory repositories, not a campus:

- course discovery, session id normalization and duplicate links;
- deadline precedence and title-date inference;
- per-section failure tolerance, retries and batch progress;
- ingestion: idempotency, schedules, dismissed tasks, removal marking,
  academic periods and ownership.

### Still needs a person with a UJCV session

- a complete Sync All with the current Companion across every enrolled course;
- expired-session detection, which assumes Chamilo's standard login form;
- whether long assignment or announcement lists are paginated, in which case
  only the first page would be read;
- agenda reading when the current month has no events;
- page and list timeouts on a slow campus.

## UNAH / Moodle

| Item | Status |
|---|---|
| Connector feasibility | **blocked** — requires a real student session |

No UNAH beta tester is available yet. Moodle does expose web service tokens to
students from their own profile, so this path may reach the official API, which
would be a better mechanism than the one available at UJCV. Untested until a
student runs it.

## Fixtures

Fixtures may be used to develop connector tests, normalization, duplicate
detection and parsing.

**A fixture is never evidence by itself.** The UJCV fixtures above count as
evidence of what the campus served only because they were captured from it; a
fixture written by hand says nothing about a campus. A capability counts as
validated only when a real student session returned it.

## How Campus Sync behaves

What the Companion, the import screen and ingestion do. This describes the code;
the validation status above still applies.

### Reading the campus

- **Course identity.** A Chamilo course is its code plus its session id. A
  missing or empty `id_session` is read as `0`, which is what Chamilo means by
  it. Pulse also matches a link stored without a session, so older links keep
  working.
- **Sync All.** The content script runs the whole batch and writes progress
  and results to extension storage, so the popup can close and reopen. Each
  course moves through pending, syncing, done or error.
- **Sections fail independently.** Documents, assignments, announcements and
  agenda are read separately. A section that cannot be read is reported and
  left out; the rest of the course still imports. A section is never half
  read. An expired campus session stops the batch and marks the remaining
  courses for a retry.
- **Retries.** Failed courses and courses with unread sections can be retried
  without reading the others again. Each section comes from the newest read
  that got through, so a retry never loses a section read earlier.
- **Deadlines.** In order: a date in the assignment list, a date on the
  assignment page, the linked agenda event, and only then a deadline clearly
  written in the title. Without any of them the task has no date.

### Importing into Pulse

- **Matching.** A course keeps the subject it is linked to in the active
  period, then joins a subject with the same code or name, and only then
  creates one. Only imported courses are removed from the extension.
- **Schedules.** A detected schedule is saved only when the student confirms
  it, and an identical slot is never stored twice.
- **Periods.** Campus Sync writes into the active period only, and a link
  belongs to one period. A course that returns in a later period becomes a new
  subject; the old subject, its tasks, schedule and sync history stay with
  their period and are never revived or moved.
- **Archived subjects.** Sync All keeps an archived subject archived while its
  campus data updates. Importing that single course explicitly restores it.

### When things disappear

| Situation | What Pulse does |
|---|---|
| The student deletes a campus task | The campus item records the decision and the task is never recreated, even if the campus changes it. It can be restored from Tareas. |
| A campus task disappears without the student deleting it | It is recreated on the next sync. |
| A section could not be read | Nothing is marked; a read failure is never treated as a removal. |
| A section was read completely and an item is missing | The item is marked as no longer on the campus. Its task or document stays in Pulse and says so; activity reports the removal. The mark clears if the item returns. |
| An agenda event moved or disappeared | Agenda reads start at the current month, so absence is not proof of removal. Upcoming events missing from the latest agenda read are hidden; past ones stay as history. |
| The student deletes a subject | Its tasks, campus document links and recording files go with it. Uploaded files and notes move to Materias › Sin materia. Syncing the course again starts fresh. |

Nothing the student created is deleted because the campus stopped listing it.
