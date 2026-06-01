# SDD 0153: Identity Phase Gateway DB Diagnostics

## Problem

SDD 0152 added Identity session operation timing and the P52 evidence showed
that high-concurrency latency is dominated by gateway-side pool acquire
queueing. However, the current benchmark runner only captures gateway database
diagnostics before and after the entire benchmark.

That whole-run view mixes measured phase work with seed and cleanup work. For
example, `principalLookup` seeds thousands of sessions before measuring reads,
and `passwordLogin` cleans up sessions after measuring login writes. Without
phase-scoped diagnostics, tuning worker count, pool size, ingress fanout, or
client connection fanout still risks moving the tail between phases without
proving which phase created the queue.

## Source Requirement References

- Immutable root requirement: identity/session flows remain part of the
  whole-system assistant runtime for teacher, student, research, admin, and
  remote entry points.
- SDD 0147: revoke-cycle attribution identifies phase steps but not gateway DB
  queue pressure around each phase.
- SDD 0152: operation timing proves gateway-local queueing is the next
  bottleneck to isolate.
- P52 report: pool20 and multi10/pool12 profiles were mixed, so the next
  configuration work must be phase-aware.

## Scope

In scope:

- Let the Go Identity HTTP benchmark collect gateway DB diagnostics before and
  after each measured phase.
- Keep diagnostics optional and disabled unless the Node runner passes the
  gateway diagnostics base URLs and internal diagnostics secret.
- Preserve the existing whole-run `gatewayDatabaseDiagnostics` snapshots in the
  Node wrapper.
- Keep public Identity HTTP contracts unchanged.

Out of scope:

- Changing session, authentication, refresh, revoke, or authorization behavior.
- Changing the benchmark workload shape.
- Promoting any ultra-concurrency claim.
- Adding model training, OCR, RAG, vector, embedding, cache, queue, or other
  heavy runtime dependencies.

## Contracts

- `services/identity-access-gateway/cmd/httpbench` accepts optional
  `-gateway-diagnostics-base-url` and `-gateway-diagnostics-secret` flags.
- When diagnostics are configured, the benchmark report includes
  `gatewayDatabasePhaseDiagnostics`.
- Each phase diagnostics entry may include `before`, `after`, and `delta`.
- The diagnostics response must not echo the local secret `ueacd`.
- The Node runner passes gateway base URLs, not ingress URLs, to the Go
  diagnostics collector. In Docker benchmark runtime it rewrites those URLs to
  the configured Docker host alias.

## Acceptance Criteria

- A focused Go test fails if phase diagnostic deltas do not summarize pool
  acquire and session operation deltas.
- A focused Go test proves diagnostics collection masks secrets and records
  unavailable gateways without failing the benchmark.
- A focused Node test fails if the Docker benchmark command does not pass
  gateway diagnostics base URLs that are reachable from the container.
- Existing Identity HTTP benchmark tests pass.
- `npm run verify:structure`, `git diff --check`, and strict quality remain
  passable.

## Observability And Performance Evidence

This slice is diagnostic plumbing. The follow-up live benchmark should use the
same 4400-concurrency profile and inspect `gatewayDatabasePhaseDiagnostics` to
separate:

- measured password login writes from cleanup revokes;
- principal lookup reads from seed login writes;
- refresh rotation updates from seed and cleanup work;
- revoke-cycle composite work from the rest of the run.

Only after phase-scoped queue pressure is clear should worker, pool, ingress,
and transport fanout defaults be changed.

## Rollback

Remove the optional benchmark flags, the phase diagnostics report field, Node
command wiring, focused tests, and this SDD entry from structure verification.
Existing benchmark reports remain readable because the new field is additive and
optional.
