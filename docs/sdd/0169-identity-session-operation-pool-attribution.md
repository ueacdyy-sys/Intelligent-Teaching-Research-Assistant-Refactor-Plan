# SDD 0169: Identity Session Operation Pool Attribution

## Problem

P77 verified the P76 principal JSON write-path optimization under the same
`mixed1600` system profile. The run passed with zero errors and reduced system
P99 versus the P73 same-run baseline, but `Identity And Access` still owned the
system max P99 through `revokeCycle`.

The current diagnostics expose per-phase pgx pool acquire totals and
per-operation total elapsed time, but they do not attribute local pool acquire
time to each session operation. As a result, `revokeOwnSession` is visible as
slow, but the report cannot prove whether the next optimization belongs in SQL,
pgx pool placement, PgBouncer scheduling, or worker concurrency.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0013: self-revoke must keep the one-write fast path.
- SDD 0095: revoke uses physical delete to avoid revoked-row accumulation.
- SDD 0167: system reports must surface Identity operation-level diagnostics.
- P77 report: `revokeCycle.revokeOwnSession` remains the slowest session
  operation in the controlling mixed-system phase.

## Scope

In scope:

- Add operation-level pgx pool acquire attribution for PostgreSQL-backed
  `SessionStore` exec operations.
- Keep existing operation total elapsed fields unchanged.
- Surface the new attribution through internal diagnostics, HTTP benchmark
  child reports, system rollups, and scale-up merges.
- Use the attribution to guide the next `revokeOwnSession` optimization.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing revoke semantics, durable token invalidation, or row deletion.
- Raising worker counts, pgx pool sizes, PgBouncer limits, or write concurrency
  defaults.
- Adding Redis, model/training/OCR/RAG/vector/embedding dependencies.

## Contracts

- `SessionOperationTimingStat` keeps `count`, `totalElapsedMs`,
  `averageElapsedMs`, and `maxElapsedMs`.
- Measured PostgreSQL exec operations also report:
  - `poolAcquireCount`
  - `poolAcquireElapsedMs`
  - `averagePoolAcquireElapsedMs`
  - `dbExecuteElapsedMs`
  - `averageDbExecuteElapsedMs`
- Non-measured stores keep the new fields at their zero values.
- System Identity summaries preserve the new fields when child diagnostics
  provide them and recompute averages during scale-up merges.

## Acceptance Criteria

- A focused PostgreSQL adapter test fails before implementation because
  operation timing stats do not expose pool acquire and DB execute breakdowns.
- A focused HTTP benchmark diagnostics test fails before implementation because
  session operation deltas do not preserve the new fields.
- A focused system summary test fails before implementation because merged
  session operation summaries do not recompute the new averages.
- Focused tests pass after implementation.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` pass.
- A narrow Identity HTTP smoke records the new fields for `saveSession` and
  `revokeOwnSession`.

## Rollback

Remove the measured exec interface, remove the new timing fields, restore the
previous session operation diagnostics shape, and keep P77 as the latest
operation-level performance evidence.
