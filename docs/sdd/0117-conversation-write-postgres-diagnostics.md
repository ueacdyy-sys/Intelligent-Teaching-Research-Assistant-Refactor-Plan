# SDD 0117: Conversation Write PostgreSQL Diagnostics

## Problem

SDD 0116 raised the Research conversation write low-latency profile to direct
eight-gateway 2600 concurrency, but the 2750 and 2800 direct probes crossed the
500ms P95 target. The current evidence does not show whether that tail latency
comes from PostgreSQL WAL/fsync waits, PgBouncer scheduling, gateway DB pool
pressure, or benchmark-side connection pressure.

Without bounded database diagnostics, the next optimization would be guesswork
and could increase capacity in the wrong layer.

## Source Requirement References

- Root requirement: the packaged application must be efficient, stable, and
  suitable for high-concurrency teaching and research workflows.
- SDD 0001: Research conversation creation remains the first measured Go
  hot-path migration candidate.
- SDD 0116: direct eight-gateway 2600 is the current low-latency pass point;
  2750/2800 are zero-error capacity probes with P95 above target.

## Scope

In scope:

- Extract PostgreSQL and PgBouncer diagnostic collectors into module-neutral
  tools so Identity and Research evidence use the same probes.
- Add optional PostgreSQL wait, lock, relation-size, and PgBouncer snapshots to
  the Research conversation write runner.
- Keep diagnostics disabled by default.
- Record before/timeline/after PostgreSQL snapshots and before/after
  PgBouncer snapshots when enabled.
- Keep the runtime dependency baseline unchanged: no model, training, OCR,
  vector, RAG, or embedding dependencies are added.

Out of scope:

- Changing PostgreSQL durability or table persistence.
- Changing PgBouncer capacity.
- Changing the Research conversation domain contract or root requirements.
- Promoting a higher current concurrency point without benchmark evidence.

## Contracts Touched

- `tools/postgres-diagnostics.mjs` provides bounded PostgreSQL diagnostics with
  configurable relation filters.
- `tools/pgbouncer-diagnostics.mjs` provides bounded PgBouncer diagnostics.
- `tools/run-conversation-write-benchmark.mjs` accepts diagnostic flags and
  preserves sanitized diagnostics in success and failure reports.
- Identity diagnostic entrypoints remain as compatibility facades.

## Acceptance Criteria

- Existing Identity diagnostics tests continue to pass through the compatibility
  facades.
- Conversation runner tests prove diagnostics can be attached without leaking
  `ueacd` or raw PostgreSQL DSNs.
- A direct eight-gateway boundary run at 2750 or 2800 concurrency records
  PostgreSQL wait timeline and PgBouncer snapshots.
- The evidence report explains the measured bottleneck before changing
  capacity or application behavior.
- `npm run quality` passes.

Current evidence update:

- PostgreSQL diagnostics at 2750/warm200 showed no sampled `WalWrite`,
  `WalSync`, or lock-wait bottleneck, and PgBouncer snapshots showed
  `cl_waiting=0`. The diagnostic probe itself raised latency, so it is used for
  bottleneck direction rather than the promoted latency value.
- A direct 2750 repeat with warm200 failed with local connection refusals while
  gateway processes stayed alive, proving the warm/cold connection boundary was
  a benchmark/runtime configuration bottleneck.
- Adding bounded warm-up retries and warming each gateway host to its measured
  connection cap moved direct 2800 to the current low-latency point:
  6282.99 RPS, P95 453.72ms, 0 errors.
- Direct 3000 with pool10 can pass functionally, but repeat evidence exceeded
  500ms P95, so it remains a capacity/tail-latency probe rather than current.

## Rollback

Remove the generic diagnostic tool modules, restore the Identity-specific
diagnostic implementations, remove the conversation runner diagnostic flags,
remove generated diagnostic benchmark reports, and remove this SDD. Benchmark
behavior remains unchanged when diagnostics are disabled.
