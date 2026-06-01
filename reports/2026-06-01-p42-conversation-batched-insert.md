# Conversation Batched Insert Performance Slice

## Summary

SDD 0125 adds an adapter-level batched insert repository for the Research
conversation write gateway. The use-case port and HTTP API remain synchronous:
each request still waits for its persistence result, but concurrent creates can
share one PostgreSQL acquisition and one multi-row insert.

The profile is promoted. The strongest repeat-backed low-latency point is now
sixteen gateway processes with pool1 each, batch size 64, and no artificial
flush delay. It reduces the application-side DB connection budget from eighty
to sixteen while improving latency and throughput.

## Evidence

Promoted report:

- `reports/conversation-write-http-benchmark.current.json`
- source repeat: `reports/conversation-write-http-benchmark.direct16-concurrency2900-multi16-pool5-client181-batched64-delay0-repeat.json`

Candidate and boundary reports:

- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-batch-default-control.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-batched32-delay0.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-batched64-delay0.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-batched64-delay0-repeat.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-batched128-delay0.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency2900-multi16-pool5-client181-batched64-delay0.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency2900-multi16-pool1-client181-batched64-delay0.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency2900-multi16-pool1-client181-batched64-delay0-repeat.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency4350-multi16-pool5-client272-batched64-delay0.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency4350-multi16-pool1-client272-batched64-delay0.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool5-client362-batched64-delay0.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client362-batched64-delay0.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency7000-multi16-pool5-client438-batched64-delay0.json`
- `reports/conversation-write-http-benchmark.direct16-concurrency7000-multi16-pool1-client438-batched64-delay0.json`

| Profile | Concurrency | RPS | P95 | P99 | Server P99 | Batch wait P99 | DB acquire P99 | DB insert P99 | Gap P99 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| previous current 8x10/client272 single-write | 2900 | 6701.79 | 409.58ms | 437.89ms | 314.99ms | n/a | 304.50ms | 30.42ms | 124.33ms | 0 |
| control 8x10/client272 single-write cold/noisy | 2900 | 3890.56 | 896.07ms | 934.47ms | 700.58ms | n/a | 674.86ms | 106.72ms | 357.80ms | 0 |
| 8x10/client272 batch32 | 2900 | 21165.27 | 152.76ms | 175.20ms | 65.59ms | 58.37ms | 0.00ms | 15.70ms | 128.01ms | 0 |
| 8x10/client272 batch64 | 2900 | 25815.23 | 134.31ms | 154.86ms | 56.11ms | 44.40ms | 0.60ms | 30.91ms | 114.28ms | 0 |
| 8x10/client272 batch64 repeat | 2900 | 21048.39 | 181.47ms | 196.05ms | 47.95ms | 31.48ms | 0.00ms | 26.32ms | 167.81ms | 0 |
| 8x10/client272 batch128 | 2900 | 24612.85 | 147.85ms | 189.97ms | 63.97ms | 49.83ms | 0.00ms | 42.60ms | 133.98ms | 0 |
| 16x5/client181 batch64 | 2900 | 27144.68 | 117.67ms | 143.21ms | 84.29ms | 70.13ms | 0.57ms | 53.70ms | 77.78ms | 0 |
| 16x5/client181 batch64 repeat | 2900 | 28265.58 | 127.76ms | 153.85ms | 79.30ms | 58.96ms | 0.00ms | 44.20ms | 88.09ms | 0 |
| 16x1/client181 batch64 | 2900 | 24654.41 | 129.06ms | 148.96ms | 118.46ms | 91.93ms | 0.00ms | 57.38ms | 63.13ms | 0 |
| promoted 16x1/client181 batch64 repeat | 2900 | 28929.30 | 116.24ms | 126.62ms | 99.14ms | 80.53ms | 0.00ms | 59.89ms | 57.33ms | 0 |
| 16x5/client272 batch64 capacity | 4350 | 26135.36 | 221.65ms | 246.42ms | 78.88ms | 63.65ms | 0.00ms | 39.97ms | 211.26ms | 0 |
| 16x1/client272 batch64 capacity | 4350 | 23996.67 | 223.75ms | 274.18ms | 105.01ms | 71.83ms | 0.00ms | 51.78ms | 208.64ms | 0 |
| 16x5/client362 batch64 capacity | 5800 | 19373.85 | 455.32ms | 488.89ms | 90.33ms | 71.37ms | 0.00ms | 49.11ms | 468.53ms | 0 |
| 16x1/client362 batch64 capacity | 5800 | 22447.53 | 368.70ms | 409.92ms | 115.83ms | 84.00ms | 0.00ms | 53.25ms | 384.80ms | 0 |
| 16x5/client438 batch64 limit probe | 7000 | 16116.32 | 655.03ms | 721.10ms | 69.66ms | 44.15ms | 0.00ms | 40.43ms | 699.32ms | 0 |
| 16x1/client438 batch64 limit probe | 7000 | 15449.27 | 695.39ms | 729.13ms | 81.37ms | 63.18ms | 0.00ms | 41.27ms | 702.37ms | 0 |

## Interpretation

- The previous dominant bottleneck, `db.acquire`, is removed from the hot tail.
  In the promoted pool1 profile, gateway pool acquisitions dropped to 146 total
  acquire calls for 5800 operations, with only 16 empty-pool waits.
- Batch size 64 is the best observed balance. Batch32 leaves more batch
  overhead, while batch128 increases INSERT and end-to-end tail latency.
- More gateway fan-out becomes useful only after batching removes DB acquire
  pressure. The previous 10-gateway same-budget probe was negative because each
  request still acquired a DB slot; the batched 16-gateway profile reduces
  client/server gap while keeping the same total DB budget.
- Reducing each gateway to pool1 improved the resource profile without hurting
  the promoted low-latency point; it uses 16 total app-side DB connections
  instead of 80.
- The current low-latency claim moves from 2900 concurrency at P99 437.89ms to
  2900 concurrency at P99 126.62ms.
- The current zero-error capacity evidence reaches 7000 concurrency on this
  local machine, and the pool1 profile stays under 500ms P99 through 5800
  concurrency. At 7000 concurrency the P99 growth is mostly
  client/HTTP gap rather than server-side database work.

## Decision

Promote `16 gateways x pool1 x batch64 x client181` as the current Research
conversation write profile for low-latency evidence.

Keep batching disabled by default in code (`CONVERSATION_WRITE_BATCH_SIZE=1`) so
rollback is immediate and production adoption stays explicit. The performance
profile should enable:

- `CONVERSATION_WRITE_BATCH_SIZE=64`
- `CONVERSATION_WRITE_BATCH_DELAY_MS=0`
- `gateway-count=16`
- `db-max-conns=1`

## Next Work

- Add fairness/backpressure controls if lower-concurrency mixed traffic shows
  head-of-line blocking.
- Investigate the remaining client/server gap with a Dockerized or distributed
  load generator before claiming that the application server itself tops out at
  7000 concurrency.
- Sparse low-concurrency writes were validated in
  `reports/2026-06-01-p43-conversation-low-concurrency-batch-guard.md`; extend
  this to true mixed conversation workflows when read/update endpoints exist.

## Cleanup

After evidence collection:

- residual benchmark rows must be checked and cleaned if present;
- Docker performance containers must be stopped before merge-ready status;
- benchmark JSON reports must not contain raw PostgreSQL DSNs or local secret
  values.
