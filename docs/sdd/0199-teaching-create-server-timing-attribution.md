# SDD 0199: Teaching Create Server Timing Attribution

## Problem

The latest production 10k evidence shows Teaching Archive `createArchiveItem`
as the slowest read/write phase:

```json
{
  "rps": 820.51,
  "p99Ms": 885
}
```

The report does not explain whether that tail latency is dominated by
server-side application work, database insert time, client/load-generator wait,
or queueing outside the handler. Without that split, further Teaching write-path
changes would be guesswork.

## Scope

- Add Teaching Archive timing context for the `createArchiveItem` use case.
- Record archive item database insert duration in the Postgres repository.
- Return `Server-Timing` for successful archive item creates.
- Teach the Teaching benchmark runner to parse `Server-Timing` and summarize
  phase-level server timing and `db.insert` breakdowns.

## Non-Goals

- Claiming a new 10k RPS result without rerunning the Docker-backed production
  mixed workload.
- Adding batching, queues, caching, model, OCR, RAG, vector database, training,
  Mem0, Milvus, vLLM, SFT, RL, or FP8 dependencies.
- Changing immutable root requirements.

## Contracts

- `POST /v1/teaching/archive-items` must include `Server-Timing` with `app` and
  `db.insert` durations on successful creates.
- Teaching benchmark phase reports must include `serverTimingMs`,
  `serverTimingSamples`, `serverTimingBreakdownMs`, and
  `serverTimingBreakdownSamples` when the gateway returns timing headers.
- Timing data is diagnostic only and must not alter response bodies, status
  codes, authorization, validation, or persistence behavior.

## Acceptance Criteria

- The HTTP API test fails before this change because `Server-Timing` is absent
  and passes after implementation.
- The Teaching benchmark test fails before this change because phase timing
  summaries are absent and passes after implementation.
- `go test ./services/teaching-archive-gateway/internal/adapter/httpapi
  ./services/teaching-archive-gateway/internal/adapter/postgres` passes.
- `node --test tools/run-teaching-archive-benchmark.test.mjs` passes.
- Existing quality gates stay green.

## Rollback

Remove the Teaching timing context, repository timing capture, response header,
and benchmark parsing. The service behavior remains functionally correct, but
future Teaching write-path performance work loses server/client attribution.
