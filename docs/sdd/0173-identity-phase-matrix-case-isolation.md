# SDD 0173: Identity Phase Matrix Case Isolation

## Problem

P81 made phase matrix cases support per-case `sessionDbMinConns`, but its paired
smoke exposed a clear order effect: the second case was faster regardless of
whether it used `minConns=0` or `minConns=8`. That means a same-run matrix can
identify candidates, but it cannot fairly compare runtime configurations unless
each case starts from a comparable Docker/database state.

The matrix runner needs an optional per-case isolation mode that resets and
starts the Identity session Docker profile before every case.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0170: matrix reports must identify pool-wait-dominated operations.
- SDD 0171: `SESSION_DB_MIN_CONNS` stays an explicit benchmark/runtime profile
  field and defaults to `0`.
- SDD 0172 and P81: per-case min-connection comparisons need isolation or
  randomized ordering before tuning claims can be promoted.

## Scope

In scope:

- Add `--case-isolation none|docker-reset` to the Identity phase matrix runner.
- Preserve `none` as the default and keep existing setup behavior unchanged.
- When `docker-reset` is selected, run Docker `reset` and `up` before each case.
- Record the isolation mode in matrix target/runtime profiles and setup entries.
- Reject `docker-reset` when `--manage-docker false`.

Out of scope:

- Changing Identity runtime defaults, SQL, session semantics, PgBouncer limits,
  PostgreSQL limits, worker count, or write concurrency.
- Claiming a new concurrency ceiling from a narrow isolated smoke.
- Adding Redis, model/training/OCR/RAG/vector/embedding dependencies.

## Contracts

Default behavior remains one managed setup for the whole matrix:

```json
{
  "caseIsolation": "none",
  "setup": ["setup-reset", "setup-up"]
}
```

Isolated behavior resets and starts the Docker profile per case:

```json
{
  "caseIsolation": "docker-reset",
  "setup": [
    "case-min0-reset",
    "case-min0-up",
    "case-min8-reset",
    "case-min8-up"
  ]
}
```

## Acceptance Criteria

- A focused Node test proves default `caseIsolation=none` preserves existing
  setup behavior.
- A focused Node test proves `caseIsolation=docker-reset` runs reset/up before
  every case and records the mode in the report.
- A focused Node test proves `caseIsolation=docker-reset` is rejected when
  managed Docker is disabled.
- A real isolated smoke compares `minConns=0` and `minConns=8` with per-case
  Docker reset.
- Focused tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove `--case-isolation` handling and keep the existing one-setup-per-matrix
behavior. P81 per-case min-connection case specs remain available.
