# SDD 0147: Identity Revoke Cycle Latency Attribution

## Problem

Root SLO promotion is still blocked by the Identity revoke-cycle P99. Current
reports include per-step latency for `login`, `revoke`, and
`revokedPrincipalLookup`, but the report does not directly identify the slowest
step or the residual gap between the composite phase latency and the summed step
latencies.

Without this attribution, each worker/pool probe has to be inspected manually,
which makes it too easy to tune workers, pools, or PgBouncer before proving
whether the bottleneck is service-side write pressure, verification reads, or
client/runtime overhead.

## Source Requirement References

- Immutable root requirement: support teacher/student/research identity flows as
  part of the whole-system assistant.
- Root SLO review: `identity.slowest_p99_ms=2893.02` blocks full-system
  ultra-concurrency promotion.
- SDD 0146: worker/pool fanout alone did not solve the Identity tail latency
  blocker.

## Scope

In scope:

- Add machine-readable revoke-cycle step attribution to Identity HTTP benchmark
  phase reports.
- Preserve existing `latencyMs` and `stepLatencyMs` fields.
- Identify the slowest step by P99.
- Record phase P99, summed step P99, P99 residual, phase average, summed step
  average, and average residual.
- Keep public Identity HTTP contracts unchanged.

Out of scope:

- Changing session security semantics.
- Promoting a new Identity capacity claim.
- Replacing the benchmark with a synthetic empty endpoint.
- Adding training, model, OCR, RAG, vector, embedding, or other heavy runtime
  dependencies.

## Contracts

- `services/identity-access-gateway/cmd/httpbench` report JSON gains optional
  `stepLatencyAttribution` on phases that record step latencies.
- Existing benchmark consumers can continue using `latencyMs` and
  `stepLatencyMs`.
- No OpenAPI contract changes.

## Acceptance Criteria

- A focused test proves `buildPhaseReportWithStepLatencies` emits attribution.
- Phases without step latency remain unchanged.
- Identity httpbench focused tests pass.
- Strict quality remains passable after the slice.
- Root SLO promotion remains blocked unless evidence actually meets the root
  gates.

## Observability And Performance Evidence

The attribution makes every future Identity revoke-cycle report directly show
whether the slowest P99 comes from login, revoke, revoked-principal verification,
or a composite/runtime residual. This is diagnostic evidence for the next
optimization slice, not promotion evidence by itself.

## Rollback

Remove the optional attribution field and its focused tests. Existing benchmark
reports remain readable because the original fields are unchanged.
