# SDD 0111: Identity Benchmark Session Persistence Argument

## Problem

SDD 0110 added `SESSION_DB_SESSION_TABLE_PERSISTENCE=logged|unlogged` and proved
that the unlogged session-table profile improves the 4400-concurrency Identity
HTTP benchmark. The benchmark command still has to set that value through an
outer shell environment variable, and the runner's runtime profile does not
record the requested persistence mode.

That makes future performance evidence easier to misread or fail to reproduce.
The benchmark runner should own the profile knob just like it owns
`SESSION_DB_MAX_CONNS` and `SESSION_DB_WRITE_CONCURRENCY`.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay compact, stable, and
  efficient.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0110: unlogged session table is explicit, opt-in, and remote command
  nonces stay logged.

## Scope

In scope:

- Add a runner argument:
  `--session-db-session-table-persistence logged|unlogged`.
- Pass the selected value to spawned Identity gateways through
  `SESSION_DB_SESSION_TABLE_PERSISTENCE`.
- Include the selected value in benchmark `gatewayDatabaseProfile`.
- Preserve `logged` as the runner default.
- Keep `tools/run-identity-http-benchmark.mjs` below the strict 800-line quality
  limit by moving persistence-profile helper code into a small helper module.

Out of scope:

- Running another 4400 benchmark.
- Changing the default from `logged` to `unlogged`.
- Changing Identity HTTP contracts or token/session semantics.
- Making remote command nonces unlogged.

## Contracts Touched

- Benchmark CLI accepts `--session-db-session-table-persistence`.
- Benchmark reports include
  `gatewayDatabaseProfile.sessionTablePersistence`.
- Existing commands without the new argument keep logged session-table behavior.

## Acceptance Criteria

- Focused runner tests fail before implementation because the parsed profile is
  missing from `gatewayDatabaseProfile`.
- Focused runner tests pass after implementation.
- `tools/run-identity-http-benchmark.mjs` remains below 800 lines.
- `npm run quality` passes.

## Rollback Plan

Remove the new runner argument and helper module, remove the report profile
field, and keep using outer environment variables for rare manual experiments.

## Observability And Performance Evidence

Record:

- Red/green focused runner tests.
- Source-line count for `tools/run-identity-http-benchmark.mjs`.
- Green strict quality gate output.
