# SDD 0154: Identity Phase-Aware Matrix Runner

## Problem

SDD 0153 made the Identity HTTP benchmark collect gateway database diagnostics
per measured phase. The next tuning step needs to compare worker count,
per-worker session DB pool size, ingress fanout, and client connection fanout as
a coupled matrix.

Running those combinations by hand is error-prone. It also makes it too easy to
compare only top-level P99 while ignoring phase-specific pgx pool acquire wait
and session operation timing. That would preserve the current bottleneck guess
instead of turning it into repeatable evidence.

## Source Requirement References

- Immutable root requirement: identity/session flows are part of the
  whole-system assistant runtime and must remain compatible with teacher,
  student, research, admin, and remote entry points.
- SDD 0152: operation timing shows gateway-local queueing is a key Identity
  bottleneck.
- SDD 0153: phase-scoped gateway DB diagnostics are available and must guide
  the next configuration work.
- P53 report: the next useful run is a compact matrix around gateway workers,
  per-worker DB pool size, ingress workers, and client connections.

## Scope

In scope:

- Add a Node matrix runner for Identity HTTP benchmark cases.
- Keep the runner optional; it is not part of `npm test` live execution.
- Use the existing Identity HTTP benchmark runner as the child workload.
- Summarize each case by phase errors, phase latency, pgx acquire wait, and
  session operation timing deltas.
- Support Docker-managed setup and cleanup around the full matrix.
- Emit a machine-readable rollup report with a recommended passing case.

Out of scope:

- Changing session/authentication behavior.
- Changing root capacity claim rules.
- Promoting any ultra-concurrency claim.
- Adding training, OCR, RAG, vector, embedding, model, or other heavy runtime
  dependencies.

## Contracts

- `npm run bench:identity-phase-matrix` runs
  `tools/run-identity-phase-matrix.mjs`.
- The runner accepts compact case specs:
  `name:gatewayCount:sessionDbMaxConns:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost`.
- The runner writes `reports/identity-phase-matrix.current.json` by default.
- Child reports remain ordinary Identity HTTP benchmark reports.
- The rollup report has `benchmarkKind=identity_phase_matrix` and
  `workloadType=IDENTITY_PHASE_MATRIX`.
- Secrets and PostgreSQL URLs are masked from command output evidence.

## Acceptance Criteria

- A focused test proves compact case specs parse into isolated child benchmark
  arguments.
- A focused test proves the rollup recommends the passing case with the lowest
  slowest phase P99 and includes phase DB diagnostics summaries.
- A focused test proves matrix execution records Docker setup and cleanup while
  masking local secrets.
- `npm run verify:structure`,
  `node --test tools/run-identity-phase-matrix.test.mjs`, and strict quality
  remain passable.

## Observability And Performance Evidence

The default matrix is intentionally small so it can act as a smoke profile. The
same runner can be scaled to the P53 matrix by passing larger case specs,
concurrency, operations, and Docker runtime settings.

The report should make it obvious whether a configuration improved tail latency
by reducing gateway pool queueing or merely moved the tail between phases.

## Rollback

Remove the matrix runner, focused tests, package script, this SDD, and the
structure verifier entries. Existing Identity HTTP benchmark reports remain
unchanged because the matrix runner only orchestrates child runs.
