# SDD 0104: Identity PostgreSQL Wait Timeline Evidence

## Problem

SDD 0103 added PostgreSQL wait timeline diagnostics for the Identity HTTP
benchmark, but instrumentation alone does not answer the performance question.
The refactor needs evidence that explains the remaining 4400-concurrency
read/write tail before changing PgBouncer, PostgreSQL, or gateway pool limits.

The current system already passes the corrected 4400 logical-concurrency profile
with zero phase errors. The open question is whether the remaining tail latency
comes from lock contention, PgBouncer queueing, gateway DB pool scheduling, or
PostgreSQL write pressure.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: runtime and packaging must stay compact, stable, and
  efficient.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0100: gateway DB pool diagnostics exposed material acquisition waits.
- SDD 0101: PgBouncer after-snapshots did not prove PgBouncer queueing.
- SDD 0102: column-backed timestamps reduced refresh/write amplification but
  did not remove the mixed read/write tail.
- SDD 0103: PostgreSQL wait timeline diagnostics are available behind an
  explicit benchmark flag.

## Scope

In scope:

- Register the 4400 PostgreSQL wait timeline benchmark as official performance
  evidence.
- Compare phase tail latency with the previous column-backed timestamp run.
- Record PostgreSQL activity, wait, and lock evidence during the benchmark
  window.
- Preserve the current six-gateway, pool12, non-overlapping ingress profile as
  the comparison baseline.
- Use the result to choose the next optimization target.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing session or token semantics.
- Raising PostgreSQL, PgBouncer, gateway DB pool, or ingress limits.
- Introducing caches or new model, training, OCR, RAG, vector, embedding, or AI
  worker dependencies.
- Claiming arbitrary ultra-high concurrency beyond the measured profile.

## Evidence Summary

Benchmark profile:

- 4400 logical clients.
- 8800 operations per phase.
- Six host Go gateways.
- 22 non-overlapping ingress listeners.
- `SESSION_DB_MAX_CONNS=12` per gateway, 72 total gateway DB clients.
- PgBouncer transaction pooling with `max_db_connections=90`.
- PostgreSQL timeline sampled every 1000ms.

Result:

- Status: `PASSED`.
- Phase errors: `0`.
- PostgreSQL timeline samples: `132`.
- Maximum observed PostgreSQL backends: `50`.
- Maximum ungranted lock count: `0`.
- PgBouncer after-snapshot `cl_waiting=0`.
- PgBouncer after-snapshot `sv_idle=48`.
- Gateway DB pool empty acquire events: `52181`.
- Maximum average gateway DB acquire wait: `313.52ms`.
- Maximum average gateway empty-acquire wait: `529.04ms`.

## Contracts

- The current measured Identity high-concurrency evidence profile is exactly
  the 4400 logical-client, six-gateway, 22-ingress, pool12 profile registered
  in the performance evidence registry.
- Evidence reports must name the source benchmark JSON before making a
  performance claim.
- PostgreSQL wait evidence must include sampled activity, database, and lock
  observations.
- A run with `max_ungranted_locks=0` must not be interpreted as lock
  contention without additional contradictory evidence.
- PgBouncer after-snapshots alone cannot prove no in-window queueing, but
  `cl_waiting=0` and `sv_idle>0` after the run are enough to reject a blind
  pool-limit increase as the next action.
- The local performance profile continues to mask `ueacd` and PostgreSQL DSNs
  in generated reports.

## Decision

Keep the current pool and ingress limits for the 4400 evidence profile. The
timeline does not show lock contention, and the PgBouncer after-snapshot does
not show queued clients. Raising gateway pool limits already had a negative
pool14 result, so the next optimization must target write-path pressure and
gateway-side DB scheduling rather than connection fan-out.

The most likely next bottleneck class is write durability pressure plus request
scheduling around writes:

- PostgreSQL wait samples include `WalSync` and `WALWrite`.
- `revokeCycle` remains the slowest phase.
- Login improved versus the previous timestamp run, but refresh and revoke tail
  still consume the concurrency budget.
- Gateway pools still report high empty-acquire wait even when PgBouncer has
  idle server connections after the run.

## Acceptance Criteria

- Register the new benchmark report in the performance evidence registry.
- Add the benchmark report to the registry audit required-report list.
- Add a human-readable evidence report with command, maintenance state, metrics,
  and interpretation.
- `npm run audit:performance-evidence` returns READY.
- `npm run quality` passes.

## Rollback

Remove this SDD, remove the P23 evidence report, remove the registry entry, and
remove the benchmark report from the required-report list. SDD 0103 remains as
instrumentation capability, and the previous column-backed timestamp benchmark
remains the current optimization evidence.

## Next Optimization

The next implementation slice should reduce write-path pressure without
changing public contracts. Candidate work must be evidence-led:

- inspect login insert and revoke delete/lookup transaction shape;
- reduce unnecessary writes or indexes on hot session paths;
- add a bounded gateway-side write scheduling experiment only with a rollback
  path;
- re-run the same 4400 profile after each change.
