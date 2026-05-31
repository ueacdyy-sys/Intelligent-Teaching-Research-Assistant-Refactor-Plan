# SDD 0112: Identity Session Persistence Evidence Gate

## Problem

SDD 0110 proved that the explicit unlogged `identity_sessions` profile can
improve the 4400-concurrency Identity HTTP benchmark, and SDD 0111 made the
benchmark runner own the profile argument. The performance evidence registry
still trusts the registry entry and file name more than the source report.

That is too weak for a performance ceiling claim. A later agent could register
an unlogged result while the report was actually generated with the logged
profile, or keep using an outer shell variable that is easy to omit when
replaying the run.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay compact, stable, and
  efficient.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0110: unlogged session table is explicit, opt-in, and remote command
  nonces stay logged.
- SDD 0111: the benchmark runner accepts
  `--session-db-session-table-persistence logged|unlogged` and records the
  selected profile in `gatewayDatabaseProfile`.

## Scope

In scope:

- Add a performance evidence audit finding for entries that report
  `session_table.persistence`.
- Require those entries to record
  `databaseEvidence.applicationPool.sessionTablePersistence`.
- Require the source benchmark report to include
  `gatewayDatabaseProfile.sessionTablePersistence`.
- Require the registry metric, registry application pool profile, and source
  report profile to agree.
- Register the unlogged 4400 report as a required performance evidence source.

Out of scope:

- Changing Identity runtime defaults.
- Promoting `unlogged` as the production default.
- Changing token, session, login, refresh, revoke, or remote command behavior.
- Making `identity_remote_command_nonces` unlogged.
- Adding Redis, queues, model, training, OCR, RAG, vector, or embedding
  dependencies.

## Contracts Touched

- Performance evidence registry entries with a `session_table.persistence`
  metric must include the same profile in
  `databaseEvidence.applicationPool.sessionTablePersistence`.
- Source HTTP benchmark reports used for those entries must include
  `gatewayDatabaseProfile.sessionTablePersistence`.
- The unlogged 4400 report remains explicit opt-in evidence, not a hidden
  default.

## Acceptance Criteria

- A focused registry-audit test fails when the unlogged evidence entry omits
  `databaseEvidence.applicationPool.sessionTablePersistence`.
- A focused registry-audit test fails when the source report omits or disagrees
  on `gatewayDatabaseProfile.sessionTablePersistence`.
- The current unlogged 4400 benchmark report is regenerated through
  `--session-db-session-table-persistence unlogged`.
- `npm run audit:performance-evidence` passes.
- `npm run quality` passes.

## Rollback Plan

Remove the new registry audit finding, remove the required unlogged source
report entry, and keep the runner-level profile argument from SDD 0111 for
manual reproducibility.

## Observability And Performance Evidence

Record:

- Red/green focused registry-audit tests.
- The regenerated unlogged 4400 benchmark report with
  `gatewayDatabaseProfile.sessionTablePersistence`.
- Green performance evidence registry audit.
- Green strict quality gate output.
