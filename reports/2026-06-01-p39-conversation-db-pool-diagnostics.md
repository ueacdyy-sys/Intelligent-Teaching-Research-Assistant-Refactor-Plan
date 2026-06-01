# Conversation DB Pool Diagnostics

## Summary

SDD 0122 adds gateway-level pgx pool diagnostics to the conversation write
benchmark. The new evidence confirms that the current write ceiling is DB pool
slot contention, not raw insert cost.

The promoted current profile remains:

- 8 conversation write gateways
- DB pool 10 per gateway, 80 total application-side connections
- PgBouncer transaction pool, max DB connections 90
- client max/warm connections per gateway host 272
- 2900 concurrency, 5800 operations

## Current Evidence

Source:

- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-db-pool-diagnostics-repeat.json`

| Metric | Value |
| --- | ---: |
| Status | PASSED |
| Errors | 0 |
| RPS | 6401.36 |
| P95 | 429.10ms |
| P99 | 439.13ms |
| Server app P99 | 322.33ms |
| DB acquire P99 | 311.36ms |
| DB insert P99 | 31.06ms |
| Client/server gap P99 | 124.79ms |
| Gateway empty acquire count | 5728 |
| Gateway aggregate acquire duration | 1447036.872ms |
| Gateway aggregate empty acquire wait | 1447036.872ms |

Interpretation:

- `db.acquire` remains the dominant server-side tail component.
- Gateway diagnostics prove most writes waited for an empty pgx pool slot.
- Insert latency is much smaller than acquire wait, so blind SQL micro-tuning is
  not the main lever.
- The current pool10/client272 profile is still the best balanced low-latency
  point among this slice's probes.

## Negative Configuration Probes

| Profile | RPS | P95 | P99 | DB acquire P99 | Gap P99 | Interpretation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| pool11/client272 | 6153.68 | 476.88ms | 510.79ms | 344.32ms | 157.84ms | More app DB connections worsened tail latency despite staying near PgBouncer's 90-connection budget. |
| pool10/client260 | 6324.48 | 447.86ms | 483.56ms | 299.47ms | 174.54ms | Lower client cap reduced server-side acquire P99 but moved too much wait into client transport. |
| pool10/client280 | 6073.68 | 461.51ms | 505.32ms | 346.79ms | 148.98ms | Higher client cap increased DB pool pressure and crossed the P99 target. |

Evidence files:

- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool11-client272-db-pool-diagnostics.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client260-db-pool-diagnostics.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client280-db-pool-diagnostics.json`

## Decision

Keep the current conversation write performance profile at pool10/client272.
Do not promote pool11 or client260/client280.

The next real optimization should reduce DB acquisition demand or write
amplification. Good candidates are:

- analyze whether all conversation indexes are required by current read paths
  before changing schema;
- test a separate access-pattern SDD for removing or deferring unused write-side
  index work;
- consider an optional write scheduler only after adding queue telemetry, since
  Identity evidence showed limiter-based shaping can simply move wait from DB
  pool acquisition into application queues.
