# SDD 0183: System Sustained Read Write RPS

## Problem

SDD 0181 makes the root SLO promotion target explicit: production read/write
throughput must reach the 10k RPS class before the system can claim that level
of concurrency. The root SLO promotion review already looks for sustained
read/write RPS fields, but the sustained mixed workload reports do not publish
those fields yet.

That gap leaves the current promotion evidence at `measuredReadWriteRps:
missing` even when child mixed workload reports already contain per-workload
RPS. The next performance step is not to claim 10k RPS. It is to make sustained
read/write throughput auditable so later Docker or WSL multi-worker runs can be
reviewed by the same root SLO gate.

## Source Requirement References

- Immutable root requirements: performance claims must serve the whole teaching
  and research assistant, not a single benchmark endpoint.
- SDD 0144: root SLO promotion review blocks unsupported whole-system
  capacity claims.
- SDD 0181: root SLO promotion requires measured sustained read/write RPS at or
  above 10000 before production 10k RPS can be approved.
- Current sustained mixed workload child reports contain measured workload RPS,
  but the sustained and scale-up summaries drop that evidence.

## Scope

In scope:

- Preserve measured per-workload RPS when summarizing sustained mixed workload
  samples.
- Add sample-level `readWriteRps` and `aggregateRps` for real read/write
  workloads.
- Add sustained-summary `readWriteRps`, `aggregateReadWriteRps`,
  `minPassedReadWriteRps`, and `maxPassedReadWriteRps`.
- Add scale-up step-level `readWriteRps` and scale-up-summary
  `highestPassedReadWriteRps`.
- Keep the aggregation conservative: for sequential sustained samples, the
  sustained RPS is the minimum passed sample RPS, not the sum of samples.

Out of scope:

- Claiming current production 10k RPS support.
- Running a new high-load Docker benchmark in this slice.
- Adding model, OCR, RAG, vector, embedding, training, load generation, or
  observability dependencies.
- Counting policy-only readiness checks as read/write throughput.

## Contracts

Sample summaries include:

```json
{
  "readWriteRps": 370,
  "aggregateRps": 370,
  "readWriteWorkloads": [
    { "name": "identity_http", "rps": 90 },
    { "name": "conversation_write", "rps": 210 },
    { "name": "teaching_archive", "rps": 70 }
  ]
}
```

Sustained summaries include:

```json
{
  "readWriteRps": 340,
  "aggregateReadWriteRps": 340,
  "minPassedReadWriteRps": 340,
  "maxPassedReadWriteRps": 370
}
```

Scale-up summaries include:

```json
{
  "highestPassedStep": "high",
  "highestPassedReadWriteRps": 10000
}
```

Only measured read/write workload slices are counted for this field:
`identity_http`, `conversation_write`, and `teaching_archive`. Readiness-only
policy checks such as knowledge retrieval policy smoke and AI worker admission
are not counted as throughput evidence.

## Acceptance Criteria

- Focused sustained runner tests prove sample summaries retain workload RPS and
  compute read/write RPS without counting readiness-only workloads.
- Focused sustained runner tests prove sequential samples use the minimum
  passed sample RPS for sustained throughput.
- Focused scale-up tests prove step summaries expose `readWriteRps` and the
  scale-up summary exposes `highestPassedReadWriteRps`.
- Focused root SLO tests continue to consume
  `sustained_scaleup.summary.highestPassedReadWriteRps`.
- `node --check` for the changed runners passes.
- Focused Node tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.
- Docker has no residual running containers after verification.

## Rollback

Remove the new RPS fields and helper functions from the sustained and scale-up
report builders, remove the focused tests, and remove this SDD. Root SLO
promotion will return to reporting missing production read/write RPS evidence
until another source provides it.
