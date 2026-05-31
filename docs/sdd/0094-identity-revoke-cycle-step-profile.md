# SDD 0094: Identity Revoke Cycle Step Profile

## Problem

The current highest verified Identity HTTP pass point is the Dockerized 4000
logical-concurrency benchmark. It passes with zero phase errors, but the
`revokeCycle` phase has the slowest tail latency.

`revokeCycle` is a mixed operation: it logs in, revokes the new session, and
then verifies that the revoked access token can no longer read the principal.
The phase-level latency alone does not show whether the tail is dominated by
login writes, revoke writes, or the post-revoke unauthorized lookup.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- SDD 0012: HTTP gateway benchmarks provide client-facing Identity performance
  evidence.
- SDD 0092: ingress safe-read retry preserved mutation safety while improving
  higher-load read stability.
- SDD 0093: Dockerized load generation established the current 4000
  logical-concurrency pass point and identified `revokeCycle` as the slowest
  successful mixed read/write phase.

## Scope

In scope:

- Add per-step latency summaries to the `revokeCycle` phase report.
- Record step names for `login`, `revoke`, and `revokedPrincipalLookup`.
- Keep the benchmark workload and public Identity HTTP contracts unchanged.
- Run a Dockerized 4000-concurrency benchmark with the step profile enabled by
  default through the report shape.

Out of scope:

- Removing the post-revoke unauthorized lookup from the benchmark.
- Changing session revocation semantics.
- Changing PostgreSQL, PgBouncer, gateway, or ingress limits before root-cause
  evidence points to a specific bottleneck.
- Introducing Redis, external caches, model dependencies, OCR, RAG, vector
  databases, embeddings, or training dependencies.

## Contracts

- `phaseReport` may include `stepLatencyMs`.
- `stepLatencyMs.login` summarizes the password-session creation step inside
  `revokeCycle`.
- `stepLatencyMs.revoke` summarizes the session delete step inside
  `revokeCycle`.
- `stepLatencyMs.revokedPrincipalLookup` summarizes the expected-401 principal
  lookup after revocation.
- Existing phase-level `latencyMs` remains the end-to-end operation latency.

## Acceptance Criteria

- A focused Go test fails before implementation because phase reports cannot
  carry step latency summaries.
- The `revokeCycle` report includes non-empty summaries for `login`, `revoke`,
  and `revokedPrincipalLookup`.
- Existing phase-level latency and error semantics remain unchanged.
- A Dockerized 4000-concurrency benchmark report records the step profile.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0094, the step-latency report field, focused tests, and any live
step-profile benchmark evidence. SDD 0093 evidence remains the current
phase-level Dockerized benchmark pass point.

## Observability And Performance Evidence

Record:

- Red focused Go test before implementation.
- Focused Go test after implementation.
- Dockerized 4000 benchmark report with `revokeCycle.stepLatencyMs`.
- `npm test` and `npm run quality` results.
