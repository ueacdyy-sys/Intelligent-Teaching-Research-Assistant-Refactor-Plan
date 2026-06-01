# Conversation Low-Concurrency Batch Guard

## Summary

SDD 0125 promotes `CONVERSATION_WRITE_BATCH_SIZE=64` with
`CONVERSATION_WRITE_BATCH_DELAY_MS=0` for the Research conversation write path.
This follow-up checks the risk called out in the batched-insert slice: the
high-concurrency batch profile must not add artificial wait for sparse or
ordinary low-concurrency create-conversation traffic.

The result is safe for the current profile. With delay0, a sparse create flushes
immediately in the repository test, and the Docker-backed HTTP path shows no
low-concurrency latency regression that would block the batched profile.
The durable machine-readable evidence is registered at
`reports/conversation-write-low-concurrency-batch-guard.current.json` so the
performance evidence audit protects this guard from being skipped later.

## Unit Guard

- `TestBatchingRepositoryZeroDelayFlushesSparseCreateWithoutWaitingForMaxSize`
  proves a single `Create` with `MaxSize=64` and `MaxDelay=0` returns without
  waiting for the batch to fill.

## Docker HTTP Evidence

Runtime profile:

- PgBouncer transaction pool through the identity-session performance compose.
- One conversation write gateway.
- `DB_MAX_CONNS=1`.
- Warm keep-alive transport sized to the low-concurrency client count.
- Local secrets remain `ueacd`, and benchmark JSON masking was checked.

| Profile | Concurrency | Operations | RPS | P50 | P95 | P99 | Server P99 | Batch wait P99 | DB acquire P99 | DB insert P99 | Gap P99 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| single-write control | 1 | 120 | 226.45 | 4.16ms | 5.47ms | 6.15ms | 6.15ms | n/a | 0.66ms | 6.05ms | 2.32ms | 0 |
| batch64 delay0 | 1 | 120 | 227.10 | 4.24ms | 5.32ms | 5.56ms | 5.25ms | 0.61ms | 0.62ms | 5.03ms | 1.63ms | 0 |
| single-write control | 4 | 240 | 245.63 | 15.79ms | 19.05ms | 20.59ms | 20.26ms | n/a | 15.06ms | 6.66ms | 2.31ms | 0 |
| batch64 delay0 | 4 | 240 | 470.36 | 8.01ms | 10.40ms | 27.33ms | 25.46ms | 17.29ms | 0.00ms | 8.17ms | 1.92ms | 0 |

## Interpretation

- The sparse single-client path is not penalized: P99 improves from `6.15ms` to
  `5.56ms`, and `db.batch_wait` P99 is only `0.61ms`.
- At four concurrent clients, batching removes pool contention
  (`db.acquire` P99 falls from `15.06ms` to `0ms`) and almost doubles RPS.
- The four-client batched P99 has a small tail bump (`27.33ms` vs `20.59ms`),
  but it remains interaction-fast and below the existing high-concurrency
  budgets by a wide margin.
- The evidence supports keeping `CONVERSATION_WRITE_BATCH_DELAY_MS=0` as the
  promoted profile. A positive artificial delay should require separate mixed
  traffic evidence before promotion.

## Commands

```powershell
npm run perf:identity-session:up
node tools/run-conversation-write-benchmark.mjs --gateway-count 1 --db-max-conns 1 --write-batch-size 1 --write-batch-delay-ms 0 --concurrency 1 --operations 120 --max-conns-per-host 1 --warm-connections-per-host 1 --out tmp/conversation-write-lowconcurrency-single-write.json --timeout 120s --startup-timeout-ms 180000
node tools/run-conversation-write-benchmark.mjs --gateway-count 1 --db-max-conns 1 --write-batch-size 64 --write-batch-delay-ms 0 --concurrency 1 --operations 120 --max-conns-per-host 1 --warm-connections-per-host 1 --out tmp/conversation-write-lowconcurrency-batch64-delay0.json --timeout 120s --startup-timeout-ms 180000
node tools/run-conversation-write-benchmark.mjs --gateway-count 1 --db-max-conns 1 --write-batch-size 1 --write-batch-delay-ms 0 --concurrency 4 --operations 240 --max-conns-per-host 4 --warm-connections-per-host 4 --out tmp/conversation-write-lowconcurrency4-single-write.json --timeout 120s --startup-timeout-ms 180000
node tools/run-conversation-write-benchmark.mjs --gateway-count 1 --db-max-conns 1 --write-batch-size 64 --write-batch-delay-ms 0 --concurrency 4 --operations 240 --max-conns-per-host 4 --warm-connections-per-host 4 --out tmp/conversation-write-lowconcurrency4-batch64-delay0.json --timeout 120s --startup-timeout-ms 180000
```

## Cleanup

- `research_conversations` was truncated after the benchmark runs.
- The identity-session performance compose was stopped after evidence capture.
- Temporary JSON reports are under `tmp/` and are not part of durable source
  control evidence.
