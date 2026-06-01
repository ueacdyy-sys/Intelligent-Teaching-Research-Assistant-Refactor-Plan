# Conversation Worker Fan-out Same-Budget Probe

## Summary

SDD 0124 tested whether the Research conversation write path improves when the
same eighty application-side DB connections are split across more gateway
processes: ten gateways with pool8 instead of the current eight gateways with
pool10.

The fan-out profile is not promoted. It reduced part of the client/server gap
in the client272 probe, but worsened DB acquisition wait and total tail latency.

## Evidence

Current promoted profile:

- `reports/conversation-write-http-benchmark.current.json`
- 8 gateways, pool10, total app DB connections 80
- 2900 concurrency, 5800 operations
- client max/warm connections per gateway host 272

Fan-out probes:

- `reports/conversation-write-http-benchmark.direct10-concurrency2900-multi10-pool8-client240-fanout.json`
- `reports/conversation-write-http-benchmark.direct10-concurrency2900-multi10-pool8-client240-fanout-repeat.json`
- `reports/conversation-write-http-benchmark.direct10-concurrency2900-multi10-pool8-client272-fanout.json`

| Profile | RPS | P95 | P99 | Server P99 | DB acquire P99 | DB insert P99 | Gap P99 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| current 8x10/client272 | 6701.79 | 409.58ms | 437.89ms | 314.99ms | 304.50ms | 30.42ms | 124.33ms | 0 |
| 10x8/client240 cold | 4304.54 | 786.53ms | 839.73ms | 667.55ms | 646.23ms | 89.16ms | 255.83ms | 0 |
| 10x8/client240 repeat | 6285.84 | 436.88ms | 482.20ms | 356.05ms | 344.51ms | 48.07ms | 138.49ms | 0 |
| 10x8/client272 | 6532.95 | 430.63ms | 473.57ms | 380.41ms | 369.17ms | 37.42ms | 103.76ms | 0 |

## Interpretation

- More gateway processes did not improve the current low-latency claim when the
  total DB connection budget stayed at eighty.
- The client272 fan-out probe lowered client/server gap P99 from 124.33ms to
  103.76ms, but this was more than offset by worse DB acquire P99.
- The current bottleneck remains database pool slot contention under synchronous
  writes, not only listener/process fan-out.
- The current 8x10/client272 profile stays the strongest repeat-backed
  low-latency point.

## Decision

Keep the current promoted Research conversation write profile at 8 gateways,
pool10, client272.

Do not move to 10 gateways with pool8 as the default profile. The next
optimization should reduce synchronous DB acquisition demand per write or
separate a true durable-command/read-model boundary, instead of merely
redistributing the same DB connection budget across more processes.

## Cleanup

After evidence collection:

- residual benchmark rows must be checked and cleaned if present;
- Docker performance containers must be stopped before merge-ready status;
- benchmark JSON reports must not contain raw PostgreSQL DSNs or local secret
  values.
