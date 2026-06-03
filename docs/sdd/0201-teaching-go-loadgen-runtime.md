# SDD 0201: Teaching Go Load Generator Runtime

## Problem

SDD 0200 proved that Teaching Archive create writes have a large client/handler
gap under the JavaScript benchmark runner. In the 4-gateway, concurrency-384
run, `createArchiveItem` P99 was `862ms`, while handler P99 was only `15.75ms`.
That evidence is strong enough to reject a database-insert bottleneck, but it
is not strong enough to decide whether the remaining gap is the JavaScript
load generator, Windows local transport, or server accept/connection queueing.

The system already has a Go/Docker benchmark runtime for Conversation writes.
Teaching needs the same kind of non-JavaScript load generator before Root SLO
or 10k-RPS claims can use Teaching evidence confidently.

## Scope

- Add `services/teaching-archive-gateway/cmd/httpbench`.
- Preserve the existing Teaching workflow shape:
  - `createArchiveItem`
  - `createQuizSubmission`
  - `listArchiveItems`
- Send the same `X-Agent-Api-Key` and `X-Principal-Context` headers as the
  existing Teaching JavaScript benchmark.
- Parse `Server-Timing` into `serverTimingMs`,
  `serverTimingBreakdownMs`, and `clientServerGapMs`.
- Support Go HTTP transport controls already used by Conversation:
  `--max-conns-per-host`, `--warm-connections-per-host`, and
  `--client-trace`.
- Let `tools/run-teaching-archive-benchmark.mjs` keep its JavaScript default,
  while allowing `--benchmark-runtime local`, `docker`, or `wsl` to execute the
  Go load generator after it starts Teaching gateway workers.
- Wire Teaching benchmark runtime options through the system mixed workload,
  sustained workload, and production10k scale-up runners so full-system
  evidence cannot silently fall back to JavaScript load generation.
- Set the initial production10k Teaching candidate to Docker Go load
  generation with a smaller DB pool when Docker evidence shows `dbMaxConns=8`
  outperforms `dbMaxConns=32` for the 4-gateway, concurrency-384 write
  pressure profile. Later full-system mixed-load evidence may supersede this
  isolated-module candidate.

## Non-Goals

- Replacing full-system sustained 10k mixed workload evidence in this slice.
- Changing Teaching API behavior, response bodies, authorization, database
  schema, or root product requirements.
- Adding external load-test dependencies such as `wrk`, `oha`, `hey`, or
  `bombardier`.
- Adding model, vector database, training, Mem0, Milvus, vLLM, SFT, RL, or FP8
  dependencies.

## Contracts

- The Go load generator report must keep `benchmarkKind:
  "teaching_archive_gateway"` and `workloadType: "HTTP_BENCHMARK"`.
- Reports must include `phases.createArchiveItem`,
  `phases.createQuizSubmission`, and `phases.listArchiveItems`.
- `createQuizSubmission` must use IDs returned by successful
  `createArchiveItem` operations.
- Reports must include `transportProfile` and, when enabled,
  `clientTraceBreakdownMs`.
- The JS runner must expose `benchmarkRuntimeProfile` so evidence shows whether
  Teaching was loaded by JS, local Go, Docker Go, or WSL Go.
- System mixed, sustained, and scale-up reports must expose the configured
  Teaching benchmark runtime profile.
- Production10k scale-up defaults must use Teaching Docker Go runtime and
  `teachingDbMaxConns=8` until newer full-system evidence proves a better
  setting.
- Local secret values and database URLs must stay masked in reports.

## Acceptance Criteria

- Go tests fail before implementation because Teaching-specific principal
  headers, archive item ID capture, and three-phase reports do not exist.
- Tool tests fail before implementation because
  `run-teaching-archive-benchmark.mjs` cannot build a Go/Docker Teaching
  benchmark command.
- `go test ./services/teaching-archive-gateway/cmd/httpbench` passes.
- `node --test tools/run-teaching-archive-benchmark.test.mjs` passes.
- A Docker Go Teaching benchmark can run against local gateway workers and
  produce a passed report with Server-Timing breakdowns.
- System mixed workload tests prove Teaching runtime, Docker host, connection
  warmup, and client trace settings are passed to the Teaching child benchmark.
- Production10k scale-up tests initially prove the target step uses Teaching
  Docker Go and the isolated-module `teachingDbMaxConns=8` candidate; SDD 0202
  supersedes this with `teachingDbMaxConns=12` after full-system mixed-load
  evidence.
- `npm run quality` passes before commit.

## Rollback

Remove `services/teaching-archive-gateway/cmd/httpbench`, remove the Teaching
benchmark runtime option from the JS runner, and keep the existing JavaScript
runner as the only Teaching load generator. The system remains functionally
correct, but Teaching performance evidence remains weaker than Conversation
evidence.
