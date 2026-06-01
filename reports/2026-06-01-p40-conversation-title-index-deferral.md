# Conversation Title Index Deferral

## Summary

SDD 0123 defers creation of `ix_research_conversations_title` in the fresh
conversation write-gateway schema. The current Go hot slice only creates
conversations; no contract or code path queries by title yet.

The same slice also fixes a multi-gateway cold-start race: reset Docker
performance databases could fail when eight gateways ran `CREATE TABLE/INDEX IF
NOT EXISTS` concurrently through PgBouncer. Schema initialization now runs on
one acquired connection inside an explicit transaction guarded by
`pg_advisory_xact_lock`.

## Fresh Schema Evidence

After `npm run perf:identity-session:reset` and a successful 8-gateway
benchmark startup, `pg_indexes` for `research_conversations` returned:

| Index |
| --- |
| `ix_research_conversations_updated_at` |
| `research_conversations_pkey` |

There is no fresh `ix_research_conversations_title`.

## Performance Evidence

Current promoted repeat:

- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-title-index-deferred-repeat2.json`

| Metric | Value |
| --- | ---: |
| Status | PASSED |
| Errors | 0 |
| RPS | 6701.79 |
| P95 | 409.58ms |
| P99 | 437.89ms |
| Server app P99 | 314.99ms |
| DB acquire P99 | 304.50ms |
| DB insert P99 | 30.42ms |
| Client/server gap P99 | 124.33ms |
| Gateway empty acquire count | 5728 |
| Gateway aggregate acquire duration | 1402909.740ms |

Comparison to prior current:

| Profile | RPS | P95 | P99 | DB acquire P99 | DB insert P99 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Prior pool10/client272 current | 6401.36 | 429.10ms | 439.13ms | 311.36ms | 31.06ms |
| Title-index-deferred repeat2 | 6701.79 | 409.58ms | 437.89ms | 304.50ms | 30.42ms |

Interpretation:

- The measured improvement is modest, so the safe claim is reduced write
  amplification plus no regression, not a new order-of-magnitude ceiling.
- DB acquire remains the dominant bottleneck.
- The first reset/cold run and first repeat were slower than the promoted
  repeat, so future ceiling claims still need repeat evidence.

Supporting reports:

- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-title-index-deferred.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-title-index-deferred-repeat.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-title-index-deferred-repeat2.json`

## Decision

Keep title index creation deferred in the fresh write-gateway schema. Do not
drop the index from existing databases at gateway startup. If title search or
conversation search becomes a committed read contract, add the access-pattern
specific index in that read slice.
