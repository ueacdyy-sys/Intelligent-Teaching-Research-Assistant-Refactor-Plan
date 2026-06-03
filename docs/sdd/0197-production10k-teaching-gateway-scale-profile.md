# SDD 0197: Production 10k Teaching Gateway Scale Profile

## Problem

The first Docker-backed `production10k` sustained mixed workload run reached
only `4567.35` read/write RPS even though the target step passed latency and
error guardrails. A focused target-step probe then reached `9323.8` RPS with
higher Identity and Conversation worker counts, but Teaching Archive remained
the slowest read/write workflow because the benchmark and system runner could
start only one Teaching gateway.

That makes the 10k profile under-scaled for a full-system claim. Identity and
Conversation can already be driven by multiple gateways, while Teaching remains
a single-process bottleneck.

## Scope

- Add `--gateway-count` support to the Teaching Archive benchmark runner.
- Distribute Teaching benchmark requests across gateway ports in round-robin
  order.
- Propagate `teachingGatewayCount` through mixed, sustained, and scale-up system
  runners.
- Include Teaching gateway count in system reports and port-overlap validation.
- Raise the `production10k` default ladder and runtime settings to the measured
  near-10k pressure profile.

## Non-Goals

- Claiming production 10k RPS before a passing Docker-backed run records
  `throughputTarget.status=MET`.
- Changing immutable root requirements.
- Adding model, OCR, RAG, vector database, training, Mem0, Milvus, vLLM, SFT,
  RL, or FP8 dependencies to the baseline.

## Evidence

Docker-backed production 10k run before this change:

```json
{
  "readWriteRps": 4567.35,
  "maxP99Ms": 278,
  "errors": 0,
  "targetStatus": "ATTEMPTED_NOT_MET"
}
```

Single-step configuration probe before Teaching gateway fanout:

```json
{
  "readWriteRps": 9323.8,
  "maxP99Ms": 708,
  "errors": 0,
  "teachingGatewayCount": 1,
  "teachingMinRps": 832.25
}
```

The next evidence must rerun the target step with multiple Teaching gateways and
must not promote the claim unless measured read/write RPS reaches 10000.

The fanout rerun confirmed that multiple Teaching gateways alone are not enough:
Teaching remained near `841.64` RPS with `createArchiveItem` as the slowest
phase. Schema inspection showed three redundant `teaching_archive_items`
indexes:

- `idx_teaching_archive_items_student_created`
- `idx_teaching_archive_items_owner_created`
- `idx_teaching_archive_items_material_created`

Each is covered by the corresponding `(filter, created_at DESC, id DESC)` page
index used by list queries. Keeping both sets increases write amplification for
the hot Teaching archive create path, so the schema must drop the redundant
indexes while retaining the page indexes.

After the index cleanup, Teaching still remained near `845.81` RPS, so the
remaining shortfall is not solved by index trimming alone. A single-variable
probe kept Identity at its stable 192-concurrency band, kept Teaching at 384,
and increased Conversation to 2304 concurrency / 9216 operations. That run
recorded:

```json
{
  "readWriteRps": 10203.96,
  "maxP99Ms": 885,
  "errors": 0,
  "targetStatus": "MET",
  "identityRps": 1805.74,
  "conversationRps": 7577.71,
  "teachingRps": 820.51
}
```

This proves the current configuration can cross the 10k read/write target under
the sustained scale-up guardrail, but it does not yet satisfy the stricter Root
interactive P99 target.

## Contracts

- `run-teaching-archive-benchmark.mjs --gateway-count N` must start N Teaching
  gateway processes, expose N base URLs, and fan out benchmark requests across
  those URLs without changing the Teaching Archive HTTP contract.
- System mixed workload runners must carry `teachingGatewayCount` from scale
  profile defaults and custom options into the Teaching benchmark subprocess,
  port-overlap validation, and generated reports.
- The `production10k` profile must use Docker-backed conversation load
  generation and a target step whose concurrency and operation counts exceed
  the effective-pressure floor for a 10000 read/write RPS claim.
- Teaching Archive schema migrations must retain the covered page indexes used
  by list queries while dropping redundant non-page archive item indexes that
  amplify the hot create path.

## Acceptance Criteria

- `run-teaching-archive-benchmark.mjs` accepts `--gateway-count N`, starts N
  gateways, and reports `gatewayCount=N`.
- System mixed workload commands pass `--gateway-count` to the Teaching
  benchmark.
- Sustained and scale-up reports expose `teachingGatewayCount`.
- `production10k` defaults include Docker load generators, multiple Identity,
  Conversation, and Teaching gateways, and target pressure above the minimum
  floor.
- Teaching schema drops redundant non-page archive item indexes and keeps the
  covered page indexes required by list queries.
- Existing quality gates stay green.

## Rollback

Restore `teachingGatewayCount=1`, remove the Teaching fanout option, and return
the production 10k ladder to its previous minimum-pressure profile. The system
would again be useful for conservative evidence gathering but not for a serious
10k capacity attempt.
