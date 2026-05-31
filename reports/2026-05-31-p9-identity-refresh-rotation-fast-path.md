# P9 Identity Refresh Rotation Fast Path

## Summary

Added SDD 0090 and optimized the Identity refresh-token write path. The use
case now checks for an optional inner port that can atomically rotate a refresh
session, and the PostgreSQL adapter implements that port with one conditional
`UPDATE ... RETURNING principal_json` statement.

The public HTTP contract stays unchanged:

- `POST /v1/identity/sessions/refresh`
- same session token response shape
- same invalid-session semantics for missing, revoked, or expired refresh
  tokens

## Reason

The current multi-ingress boundary shows that client-facing connection pressure
was reduced, but write-path tail latency became the next visible risk. At the
2600-concurrency pass point, refresh rotation had a P95 of 1449.84ms and revoke
cycle had a P95 of 1248.05ms.

Before this slice, refresh rotation used two PostgreSQL round trips:

1. Load principal by refresh token.
2. Update the row with new access and refresh tokens.

The optimized path preserves the same active and unexpired refresh-token
condition while doing the rotation and principal projection in one database
round trip.

## Red Tests

- `go test ./services/identity-access-gateway/internal/usecase -run TestRefreshSessionUsesOptimizedRefreshRotation -count=1 -v` failed before the optional fast-refresh port existed because `fastRefreshCalls = 0`.
- `go test ./services/identity-access-gateway/internal/adapter/postgres -run TestSessionStoreRotateRefreshSessionReturnsUpdatedPrincipal -count=1 -v` failed before the PostgreSQL adapter exposed `RotateRefreshSession`.

## Verification

Focused checks:

- `go test ./services/identity-access-gateway/internal/usecase -run TestRefreshSessionUsesOptimizedRefreshRotation -count=1 -v`: passed.
- `go test ./services/identity-access-gateway/internal/adapter/postgres -run TestSessionStoreRotateRefreshSessionReturnsUpdatedPrincipal -count=1 -v`: passed.
- `go test ./services/identity-access-gateway/... -count=1`: passed.
- `npm run test:identity-session:pgbouncer`: passed.

Live Identity HTTP comparison at 2000 concurrency:

| Report | Ingress workers | Gateway workers | Concurrency | Status | Refresh RPS | Refresh P95 | Revoke P95 | Errors |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency2000-multi4-ingress10-warm200.json` | 10 | 4 | 2000 | PASSED | 3506.97 | 587.64ms | 997.78ms | 0 |
| `identity-http-benchmark.concurrency2000-multi4-ingress10-warm200-fast-refresh.json` | 10 | 4 | 2000 | PASSED | 5921.69 | 346.18ms | 915.22ms | 0 |

Refresh rotation P95 improved from 587.64ms to 346.18ms at the same local
2000-concurrency multi-ingress profile, a 41.1% reduction. Refresh rotation
throughput improved from 3506.97 RPS to 5921.69 RPS, a 68.9% increase.

## Notes

A 2600-concurrency fast-refresh rerun was discarded and not registered as
evidence because it failed before the refresh phase during principal lookup
after repeated local benchmark runs exhausted Windows socket resources. The
observed `TIME_WAIT` count was over 3000, so that run was treated as local
runner exhaustion rather than code evidence.

## Next Step

Keep this slice as a write-path latency improvement. The next performance slice
should target the remaining mixed write/read tail, especially revoke-cycle
latency and gateway/upstream saturation near the 2600-to-2800 concurrency
boundary.
