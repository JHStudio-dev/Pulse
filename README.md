# Pulse

Multi-university academic management product, developed by Scale Studio.

Pulse exists to reduce the chance that a student misses important academic
information — classes, schedules, tasks, deadlines, assessments, attendance,
grades and academic risk.

## Status

Early setup. Project structure and application code are not in place yet.

## Scope

Initial validation targets are UJCV and UNAH, with Chamilo and Moodle as the
first LMS integration targets. University-specific configuration and
LMS-specific logic are kept separate — Pulse is not built around a single
university or platform.

## Structure

```text
apps/
packages/
supabase/
extensions/
docs/
```

Core academic logic stays independent from Next.js, Supabase, specific LMS
platforms and specific model providers.

## Documentation

Product requirements, architecture and roadmap are maintained locally in
`docs/` and are not tracked in this repository.
