# SDD 0134: Conversation Transport Profile Decision Audit

## Problem

SDD 0133 attributes the remaining Research conversation write tail latency to
client transport wait and pre-handler/listener gap rather than PostgreSQL
acquisition. The existing benchmark set already contains two different
transport lessons:

- At 5800 concurrency, the direct16 unlimited client transport
  (`maxConnsPerHost=0`) has lower P99 than the capped 362-per-host profile with
  zero errors.
- At 6200 concurrency, the unlimited client transport has lower latency but
  produces a Windows socket buffer error, while the capped 388-per-host profile
  passes with higher tail latency.

Those are different operational claims. The refactor needs a machine-readable
decision audit so a future change does not promote an unstable unlimited edge
profile or demote the lower-tail 5800 profile because a capped edge run passed.

## Source Requirement References

- Root requirement: Research mode must keep conversation persistence stable and
  efficient under high-concurrency teaching and research workflows.
- Root requirement: baseline runtime and package size must remain small; no
  model, OCR, RAG, vector, embedding, training, or external load-test
  dependency may be added for this audit.
- SDD 0126: client trace diagnostics identify transport and pre-handler gaps.
- SDD 0132: direct16 is the current fanout decision.
- SDD 0133: next performance work must target transport/listener scheduling
  before increasing database or worker budgets.

## Scope

In scope:

- Add a Docker-free Node audit over existing direct16 transport benchmark
  reports.
- Compare same-concurrency capped and unlimited transport reports.
- Keep separate recommendations for:
  - low-tail zero-error 5800 concurrency profile;
  - edge-stability profile above the low-tail point.
- Classify socket buffer failures as negative transport probes.
- Register the current transport decision as performance evidence and include
  the audit in the quality gate.

Out of scope:

- Running new live benchmarks.
- Changing gateway request/response contracts, schema, batching, PgBouncer,
  PostgreSQL, or worker fanout.
- Claiming full-system sustained capacity from conversation-only short bursts.
- Changing OS socket registry settings or Docker/WSL networking settings.

## Contracts

- `npm run audit:conversation-transport-profile` writes
  `reports/conversation-transport-profile-decision.current.json`.
- The audit returns `READY` only when configured source reports are present,
  parseable, and include latency, gap, DB acquire, transport profile, and error
  metrics.
- Low-tail recommendation ranks zero-error same-concurrency candidates by P99.
- Edge-stability recommendation rejects failed unlimited probes even when their
  latency is lower.
- `db.acquire` P99 must remain below the database-bottleneck threshold before
  the audit recommends a transport action.

## Acceptance Criteria

- Focused tests prove current evidence selects unlimited transport for the
  5800-concurrency low-tail profile.
- Focused tests prove current evidence rejects the 6200 unlimited profile as a
  socket-buffer negative probe and keeps the capped 6200 pass as the edge
  stability guard.
- Focused tests prove missing source reports fail readiness.
- Focused tests prove a better capped same-concurrency fixture can change the
  low-tail recommendation.
- Focused tests prove high `db.acquire` P99 prevents transport attribution.
- `npm run audit:conversation-transport-profile` passes.
- `npm run test:tools`, `npm run audit:performance-evidence`, and
  `npm run quality` pass.

## Rollback

Remove the transport profile audit script, tests, quality-gate command, current
report, and registry entry. Existing benchmark JSON reports remain available
for manual review.

## Observability And Performance Evidence

The audit report records:

- source benchmark report paths;
- max connections per host and warm connection counts;
- concurrency, gateway count, status, errors, first error, RPS, P95, P99,
  server P99, client/server gap P99, DB acquire P99, and DB insert P99;
- selected low-tail profile;
- selected edge-stability guard profile;
- negative transport probes and next recommended experiment.
