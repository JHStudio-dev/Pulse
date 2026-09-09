# Campus Sync — feasibility status

**Phase 0.1 is not complete.** It is blocked on external availability, not on
engineering. This file records what is verified, what is still unknown, and how
to resume without rebuilding the experiment.

Detailed run output lives in `experiments/campus-sync/findings/`, which is
gitignored because a real run contains course names.

## UJCV / Chamilo

Campus is Chamilo 1.x, branded "UJCVx".

| Item | Status |
|---|---|
| Authenticated access | **verified** |
| Private campus access | **verified** |
| REST API present | **verified** — endpoint returns JSON, not HTML |
| Student API key | **unavailable** — not exposed in the user profile |
| Course, material and task extraction | **pending active enrollment** |

The transport layer is proven: a student session cookie reaches authenticated
pages. What remains untested is parsing, because the account had no enrolled
courses at the time of the run.

Two findings already hold regardless of enrollment:

- Chamilo mints an `api_key` only through `action=authenticate`, which requires
  the account password. Pulse must never handle a campus password, so that path
  is closed unless an administrator exposes API keys to students.
- A valid session cookie does **not** unlock the REST API (`POST v2.php` returns
  HTTP 500). The API authenticates on `username` + `api_key` only.

**Consequence for Phase 1.5:** UJCV cannot be served by an API-key worker unless
the campus administrator enables student API keys. The realistic design is the
Campus Companion operating over the student's own session.

## UNAH / Moodle

| Item | Status |
|---|---|
| Connector feasibility | **blocked** — requires a real student session |

No UNAH beta tester is available yet. Moodle does expose web service tokens to
students from their own profile, so this path may reach the official API, which
would be a better mechanism than the one available at UJCV. Untested until a
student runs it.

## External blockers

Both are availability problems. Neither is resolved by writing code:

1. The UJCV account has no active enrolled courses.
2. No UNAH Moodle beta tester is available.

## Resuming later

The spike stays in place and needs no rebuilding:

- `experiments/campus-sync/` remains outside the workspaces, with no
  dependencies, imported by nothing
- `src/contract.ts` holds the normalized shapes and the mechanism priority
- `src/chamilo.ts` and `src/moodle.ts` hold the probes
- `README.md` documents how to run each one safely

To resume: obtain a fresh session (UJCV) or a web service token (UNAH), follow
the README, and re-run. Credentials never enter git — `.env`, cookies, session
files and HAR exports are all ignored.

## Synthetic fixtures

Fixtures may be used to develop connector contract tests, normalization,
duplicate detection and parsing, so that work is not stalled by the blockers
above.

**A fixture is never evidence.** Nothing derived from synthetic data may be
recorded or reported as real-campus validation. A capability counts as validated
only when a real student session returned it. Fixture-backed tests prove that
the code handles a shape correctly; they say nothing about whether a campus
actually serves that shape.
