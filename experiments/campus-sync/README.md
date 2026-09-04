# Campus Sync feasibility spike

Isolated experiment for Phase 0.1. **Not part of the Pulse build** — it is
outside the npm workspaces, has no dependencies, and nothing in `apps/` or
`packages/` imports it.

## What this answers

One question:

> Can Pulse reliably obtain the academic data it needs from UJCV and UNAH?

Specifically, for each platform: courses, assignments, due dates, materials,
downloadable files, and announcements where available.

It does **not** build the synchronization product. The real `CampusConnector`
is designed in Phase 1.5, once these answers exist.

## Safety rules

These are not optional:

- **No campus passwords.** Moodle uses a token you generate yourself; Chamilo
  uses an API key from your own profile. If a platform offers neither, the
  finding is that the official route is unavailable — not a reason to ask for
  a password.
- **Your own account only.** For UNAH, a beta tester runs it against their own
  session and reports the results. Never ask for someone else's credentials.
- **No security controls are bypassed.** No MFA or CAPTCHA handling exists here
  and none should be added.
- **Campus responses are untrusted input.** Every field is checked before use.
- **Read-only.** The probes never submit, post, or modify anything. File access
  is confirmed with `HEAD`, so no course material is downloaded.

## Running it

Requires Node 22+ (it runs TypeScript directly, no install step).

### UNAH / Moodle

Generate a token in Moodle: *Preferences → User account → Security keys*, for
the "Moodle mobile web service".

```bash
cd experiments/campus-sync
MOODLE_BASE_URL="https://campusvirtual.example.edu.hn" \
MOODLE_TOKEN="your-own-token" \
npm run probe -- moodle
```

### UJCV / Chamilo

Chamilo's REST module is often disabled. Run this first to find out — with no
key set, it still reports whether the API answers at all:

```bash
cd experiments/campus-sync
CHAMILO_BASE_URL="https://campus.example.edu.hn" \
npm run probe -- chamilo
```

If the module is enabled and your profile exposes an API key:

```bash
CHAMILO_BASE_URL="https://campus.example.edu.hn" \
CHAMILO_USERNAME="your-username" \
CHAMILO_API_KEY="your-own-key" \
npm run probe -- chamilo
```

## Results

Each run writes `findings/<platform>.md`. **Those files are gitignored**,
because a real run contains course names. Copy the parts worth keeping into a
committed summary with personal details removed.

## Mechanisms, in priority order

The probes start at the top and report how far they got:

1. `official_api` — documented API (Moodle web services)
2. `lms_connector` — platform-specific integration
3. `session_extension` — Campus Companion using the student's own browser session
4. `html_parsing` — reading rendered pages
5. `browser_agent` — controlled automation, last resort only

Browser automation is never the default when a deterministic route exists.

## Exit criterion

The spike passes for a platform when courses, assignments, due dates and
materials are all reachable, or when a safe and reproducible route to them is
documented. Announcements are recorded but not required — the specification
treats them as available only where the platform exposes them.

If a platform blocks integration entirely, the product keeps manual import and
Campus Companion as fallbacks. That is a valid outcome of this spike, not a
failure of it.
