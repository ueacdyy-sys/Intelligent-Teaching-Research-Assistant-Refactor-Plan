# P26 Identity Write Limiter Telemetry

## Summary

Added first-class telemetry for the optional Identity PostgreSQL write limiter.
The existing internal diagnostics endpoint now reports the limiter status next
to pgx pool stats, so future shaped-write benchmark reports can distinguish
between database pool waiting and application write-slot waiting.

The write limiter remains disabled by default. This slice does not promote
`SESSION_DB_WRITE_CONCURRENCY`; it makes the hidden queue from P25 observable.

## SDD

`docs/sdd/0107-identity-write-limiter-telemetry.md`

This slice intentionally keeps:

- no public Identity HTTP contract changes,
- no token or session semantic changes,
- no PostgreSQL, PgBouncer, gateway DB pool, or ingress limit increase,
- no default write-limiter enablement,
- no model, training, OCR, RAG, vector DB, or embedding dependency.

## Red Tests

Commands:

- `go test ./services/identity-access-gateway/internal/adapter/postgres -run TestSessionStoreWriteLimiterStatsExposeQueuedWaits -count=1`
- `go test ./services/identity-access-gateway/internal/adapter/httpapi -run TestSessionDBPoolDiagnosticsReturnsPoolStats -count=1`

Result before implementation: failed as expected.

Failures:

- `SessionStore.SessionWriteLimiterStats` did not exist.
- `platform.SessionDBPoolStats.writeLimiter` did not exist.
- `platform.SessionWriteLimiterStats` did not exist.

## Implementation

- Added `platform.SessionWriteLimiterStats` under `SessionDBPoolStats`.
- Added atomic counters to `SessionStore` for:
  - current waiters,
  - successful acquire count,
  - successful acquire cumulative wait time,
  - canceled acquire count,
  - canceled acquire cumulative wait time.
- Used nanosecond accumulation internally and converted to milliseconds for
  diagnostics to avoid losing sub-millisecond waits.
- Added `SessionDBStatsProvider` to merge pgx pool stats with write-limiter
  stats for the existing diagnostics endpoint.
- Updated the benchmark-runner test to prove `stats.writeLimiter` is preserved
  in collected gateway diagnostics.

## Verification

Commands:

- `go test ./services/identity-access-gateway/internal/adapter/postgres -run "TestSessionStoreWriteConcurrencyLimitsOverlappingWrites|TestSessionStoreWriteLimiterStatsExposeQueuedWaits" -count=1`
- `go test ./services/identity-access-gateway/internal/adapter/httpapi -run TestSessionDBPoolDiagnosticsReturnsPoolStats -count=1`
- `node --test tools/run-identity-http-benchmark.test.mjs`
- `go test ./services/identity-access-gateway/internal/adapter/postgres -count=1`
- `go test ./services/identity-access-gateway/internal/adapter/httpapi -count=1`
- `go test ./services/identity-access-gateway/... -count=1`
- `npm run audit:performance-evidence`

Results:

- Focused adapter red/green test passed.
- Focused HTTP diagnostics red/green test passed.
- Benchmark runner diagnostics preservation test passed.
- Full Identity gateway Go tests passed.
- Performance evidence registry remained READY with 36 entries.

## Diagnostics Contract

The existing internal endpoint remains:

`GET /internal/identity/session-db-pool`

It still requires:

`X-Internal-Diagnostics-Secret: ueacd`

The `stats` object now includes:

```json
{
  "writeLimiter": {
    "enabled": true,
    "limit": 10,
    "inUse": 3,
    "waiting": 1,
    "acquireCount": 99,
    "acquireWaitTimeMs": 456.75,
    "canceledAcquireCount": 0,
    "canceledAcquireWaitTimeMs": 0
  }
}
```

When `SESSION_DB_WRITE_CONCURRENCY=0` or unset, `enabled=false` and counters
remain zero.

## Interpretation

P25 showed that shaped writes reduced pgx pool wait but could regress mixed
throughput. This telemetry closes the evidence gap: future 4400-profile runs can
now show whether a profile is truly reducing pressure or simply moving wait time
from the DB pool into the application limiter.

Next performance work should rerun the shaped profile with this telemetry and
then target either limiter queue time, WAL pressure, or write amplification based
on measured evidence.
