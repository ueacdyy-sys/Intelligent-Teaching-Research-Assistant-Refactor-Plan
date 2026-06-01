# SDD 0145: PgBouncer Production Headroom Profile

## Problem

Root SLO promotion review blocks full-system ultra-concurrency partly because
the current source-evidence hot path uses 89 PgBouncer server connections while
the current cap is 90. That leaves one server connection of headroom, below the
root SLO policy target of 20 percent.

This is a configuration bottleneck, but it must not be "fixed" by claiming new
runtime capacity without evidence. The refactor needs a production-candidate
PgBouncer headroom profile that proves the configuration can satisfy the root
SLO headroom policy while staying inside the PostgreSQL safe connection budget.

## Scope

In scope:

- Add `contracts/config/pgbouncer-production-headroom.profile.json`.
- Add `tools/pgbouncer-production-headroom-audit.mjs`.
- Compare the candidate profile against current cross-module hot-path evidence.
- Compare the candidate profile against the explicit PgBouncer transaction
  connection budget.
- Require transaction pooling, bounded default/reserve pools, root SLO headroom,
  and PostgreSQL safe-budget compliance.
- Wire the audit into npm scripts, the quality gate, root SLO promotion review,
  capacity claim evidence, and the performance evidence registry.

Out of scope:

- Claiming full-system ultra-concurrency support.
- Treating a proposed config profile as a live benchmark.
- Raising PostgreSQL or PgBouncer limits without an explicit safety check.
- Adding model, OCR, RAG, vector, embedding, training, or load-generation
  dependencies to the baseline.

## Contracts

- `npm run audit:pgbouncer-production-headroom` writes
  `reports/pgbouncer-production-headroom.current.json`.
- The report uses `workloadType=PGBOUNCER_PRODUCTION_HEADROOM_PROFILE`.
- The report is `READY` only when:
  - cross-module diagnostics are `READY`;
  - the connection budget passes;
  - PgBouncer uses transaction pooling;
  - `defaultPoolSize + reservePoolSize <= maxDbConnections`;
  - current hot-path evidence leaves at least 20 percent headroom;
  - planned cross-service budget leaves at least 20 percent headroom;
  - candidate `maxDbConnections` stays within the PostgreSQL safe budget.
- The current candidate uses `maxDbConnections=120`, `defaultPoolSize=100`,
  and `reservePoolSize=20`.

## Acceptance Criteria

- Focused tests pass for the current production-candidate headroom profile.
- Focused tests fail when the candidate keeps only the current one-connection
  headroom.
- Focused tests fail when default and reserve pools exceed the cap.
- Focused tests fail when PgBouncer is not in transaction mode.
- Focused tests fail when the candidate exceeds the PostgreSQL safe budget.
- Focused tests fail when cross-module diagnostics are not ready.
- Root SLO promotion review consumes the production headroom evidence and no
  longer lists `PRODUCTION_PGBOUNCER_HEADROOM_PROFILE` when that audit is ready.
- The system capacity claim and performance evidence registry include the new
  evidence.
- `node --check tools/pgbouncer-production-headroom-audit.mjs` passes.
- `node --test tools/pgbouncer-production-headroom-audit.test.mjs` passes.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the production headroom profile contract, audit tool, focused tests,
generated report, registry entry, package script, quality-gate command, root SLO
integration, capacity evidence updates, and this SDD. Root SLO promotion review
must again list `PRODUCTION_PGBOUNCER_HEADROOM_PROFILE` as required next
evidence.

## Observability And Performance Evidence

The report records:

- current PgBouncer cap, hot-path pool total, and headroom;
- candidate PgBouncer cap, pool sizes, and headroom;
- planned connection budget, safe limit, and hard limit;
- each configuration gate and remediation guidance;
- explicit next action to apply the profile and rerun sustained mixed workload
  scale-up before any promotion claim.

This removes one configuration blocker from the review path. It does not remove
the remaining runtime blockers: root workflow runtime coverage, module evidence
depth, interactive tail latency, and higher sustained mixed workload depth.
