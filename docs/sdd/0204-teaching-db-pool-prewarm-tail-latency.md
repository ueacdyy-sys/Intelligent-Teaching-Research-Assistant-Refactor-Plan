# SDD 0204: Teaching DB Pool Prewarm Tail Latency

## Problem

SDD 0203 moved the Root SLO review onto target-bearing production10k evidence.
At this historical slice, that evidence already proved throughput: `22836.8`
mixed read/write RPS with zero errors and target status `MET`. Promotion was
still blocked by one latency finding: `production_target.max_p99_ms=310.78`,
above the then-active root interactive P99 target of `300ms`.

The slowest production10k sample is Teaching Archive sample 1. Its
`createArchiveItem` P99 is `310.78ms`, and its `db.insert` P99 is `270.08ms`.
Teaching sample 2 runs with the same 4 gateways, concurrency 384, and
`teachingDbMaxConns=12`, but drops to `127.21ms` P99 and `81.47ms`
`db.insert` P99. That shape points to cold database pool and PgBouncer
connection establishment being charged to the first interactive write sample,
not to a stable archive SQL algorithm bottleneck.

The current Teaching gateway sets `MinConns=0` and calls `pool.Ping`, which
only proves one lazy pgxpool connection. Under production10k pressure each
gateway can still create the remaining connections during the first write
burst.

## Current Status

This SDD records the historical Teaching tail-latency remediation slice. It has
been superseded by later production10k default-final sustained evidence:

- `reports/system-sustained-mixed-workload-scaleup.production10k-default-final-sustained.current.json`
- `reports/root-slo-promotion-review.current.json`
- `reports/system-capacity-claim.current.json`

Current result: 22,435.1 read/write RPS, max P99 44.44 ms, zero errors, and
Root SLO `APPROVE_PROMOTION` for the 10k/50ms claim. The remaining Teaching
Archive latency cost is now a 10ms-excellent-target optimization topic, not a
blocker for continuing the whole-system refactor.

## Scope

- Add explicit Teaching PostgreSQL pool settings for minimum and startup
  prewarmed connections.
- Keep `DB_MAX_CONNS` as the hard pool cap; prewarm cannot exceed max conns.
- Prewarm by acquiring and pinging the configured number of pgxpool
  connections before the gateway reports healthy.
- Pass Teaching DB min/prewarm settings through the Teaching benchmark runner,
  mixed workload runner, sustained runner, and production10k scale-up profile.
- Set production10k Teaching defaults to prewarm the current 12-connection
  per-gateway pool.
- Preserve report masking for local secrets and database URLs.

## Non-Goals

- Lowering the root `300ms` interactive P99 target.
- Excluding Teaching Archive from the Root SLO latency sample.
- Changing Teaching API behavior, authorization, response bodies, schema, or
  root product requirements.
- Increasing the Teaching DB max connection budget beyond the reviewed
  `teachingDbMaxConns=12`.
- Adding model, vector database, training, Mem0, Milvus, vLLM, SFT, RL, or FP8
  dependencies.

## Contracts

- `DB_MIN_CONNS` and `DB_PREWARM_CONNS` must be non-negative integers.
- `DB_MIN_CONNS <= DB_MAX_CONNS`.
- `DB_PREWARM_CONNS <= DB_MAX_CONNS`.
- Gateway startup must fail fast on invalid pool settings instead of silently
  producing misleading performance evidence.
- Teaching benchmark reports must record `dbMinConns` and `dbPrewarmConns`
  alongside `dbMaxConns`.
- Production10k scale-up defaults must keep Teaching at 4 gateways and
  `teachingDbMaxConns=12`, while also setting
  `teachingDbMinConns=12` and `teachingDbPrewarmConns=12`.

## Acceptance Criteria

- Go tests prove invalid Teaching gateway pool settings are rejected and valid
  settings map to pgxpool config.
- Tool tests prove Teaching benchmark options parse, validate, pass
  `DB_MIN_CONNS` and `DB_PREWARM_CONNS` to gateway workers, and record the
  settings in reports.
- System runner tests prove mixed, sustained, and production10k scale-up
  profiles pass and report Teaching DB min/prewarm settings.
- A target-bearing production10k default run keeps measured read/write RPS
  above 10k with zero errors and reduces max P99 to `<=300ms`.
- `npm run audit:root-slo-promotion-review` no longer reports
  `promotion.interactive_tail_latency_within_target` as a blocker.
- `npm run quality` passes before commit.

## Rollback

Set `teachingDbMinConns=0` and `teachingDbPrewarmConns=1` in benchmark profiles,
or remove the new env parsing from the Teaching gateway. Functionality remains
correct, but production10k evidence can again charge cold DB connection setup
to the first interactive write sample.
