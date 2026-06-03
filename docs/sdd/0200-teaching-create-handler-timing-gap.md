# SDD 0200: Teaching Create Handler Timing Gap Attribution

## Problem

SDD 0199 added `Server-Timing` for Teaching Archive create writes, but the
first production-shaped Teaching rerun shows a large gap between end-to-end
client P99 and the measured application/database P99:

```json
{
  "concurrency": 384,
  "createArchiveItem": {
    "latencyP99Ms": 881,
    "appP99Ms": 126.07,
    "dbInsertP99Ms": 126.07
  }
}
```

The current `app` timer starts after API-key authorization, principal header
decode, and JSON body decode. That leaves the system unable to prove whether
the missing tail latency is handler pre-use-case work, server accept/handler
queueing, or client/load-generator transport wait.

## Scope

- Extend successful Teaching Archive create responses with handler-level
  timing attribution.
- Keep the existing `app` and `db.insert` metrics stable.
- Add `pre.usecase` timing for authorization, principal decode, and request
  body decode before `CreateArchiveItem.Execute`.
- Add `handler` timing for the create handler span before response encoding.
- Surface the new timing fields in Teaching and mixed-workload benchmark
  summaries.

## Non-Goals

- Claiming a new 10k RPS result without rerunning the Docker-backed production
  mixed workload.
- Changing root requirements, API response bodies, authorization semantics,
  persistence behavior, or database schema.
- Replacing the JavaScript load generator in this slice.
- Adding model, vector database, training, Mem0, Milvus, vLLM, SFT, RL, or FP8
  dependencies.

## Contracts

- `POST /v1/teaching/archive-items` successful responses must include
  `Server-Timing` metrics named `handler`, `pre.usecase`, `app`, and
  `db.insert`.
- `handler` duration must cover the create handler from entry until just before
  response encoding.
- `pre.usecase` duration must cover request work before the use case starts.
- `app` remains the use-case duration and `db.insert` remains the repository
  insert duration.
- Benchmark reports must preserve all observed metrics in
  `serverTimingBreakdownMs` and expose Teaching summary fields for handler P99,
  pre-use-case P99, app P99, database insert P99, and the client/handler P99
  gap.

## Acceptance Criteria

- HTTP API tests fail before this change because `handler` and `pre.usecase`
  are absent, then pass after implementation.
- Teaching benchmark tests fail before this change because handler/pre-usecase
  summaries are absent, then pass after implementation.
- System mixed workload benchmark tests fail before this change because Teaching
  summary attribution fields are absent, then pass after implementation.
- `go test ./services/teaching-archive-gateway/internal/adapter/httpapi`
  passes.
- `node --test tools/run-teaching-archive-benchmark.test.mjs
  tools/run-system-mixed-workload-benchmark.test.mjs` passes.
- `npm run quality` passes before commit.

## Rollback

Remove the extra handler and pre-use-case metrics plus the summary fields.
The service remains functionally correct but future Teaching write-path
diagnostics lose the ability to distinguish handler pre-work from transport or
server queueing.
