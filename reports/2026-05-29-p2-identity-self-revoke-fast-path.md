# P2 Identity Self-Revoke Fast Path

## Decision

Identity self-revoke now has an inner optional port that allows a durable session store to revoke a matching active, unexpired access/session pair with one conditional write. The public HTTP contract is unchanged.

This keeps the clean boundary intact:

- Use case defines the optional port.
- PostgreSQL implements the optimization.
- Existing principal lookup plus revoke remains the fallback for admin or different-session revoke.

## Why

HTTP gateway benchmarks showed principal lookup stayed stable at higher concurrency, while revoke cycle grew fastest because it combines login, authorization lookup, revoke write, and verification read. For common self-revoke, the authorization condition is equivalent to:

- access token belongs to the requested session
- session is active
- session is not expired

That can be enforced at the SessionStore boundary without leaking PostgreSQL into the use case.

## Implementation

- `usecase.SelfSessionRevoker` adds `RevokeOwnSession(ctx, accessToken, sessionID, now)`.
- `IdentityService.RevokeSession` tries the optimized self-revoke path first.
- `MemorySessionStore` implements the same semantics for unit and rollback behavior.
- `postgres.SessionStore` performs a conditional `UPDATE identity_sessions ... WHERE session_id = $1 AND access_token = $2 AND revoked_at IS NULL AND expires_at >= $3`.

## Verification

- `go test ./services/identity-access-gateway/internal/usecase ./services/identity-access-gateway/internal/adapter/postgres`
- `npm test`
- `npm run audit:identity-session-runtime`
- `npm run audit:identity-access`
- `npm run budget:connections:direct-limited`
- `npm run budget:connections:pgbouncer`

## Performance Evidence

Baseline 256-concurrency HTTP revoke-cycle result:

- Report: `reports/identity-http-benchmark.concurrency256.json`
- P95: `241.86ms`
- RPS: `1071.55`
- Errors: `0`

Post-change 256-concurrency HTTP revoke-cycle result:

- Report: `reports/identity-http-benchmark.concurrency256-fast-revoke.json`
- P95: `199.53ms`
- RPS: `1291.23`
- Errors: `0`

Delta:

- P95 improved by `42.33ms`.
- Revoke-cycle throughput improved by `219.68 RPS`.
- Total benchmark duration improved from `11258.19ms` to `8434.74ms`.

## Cleanup Evidence

After the post-change benchmark:

- No listener remained on port `18100`.
- `identity_sessions`: total rows `4664`, active rows `0`.
- PgBouncer showed `cl_active=0`, `cl_waiting=0`, and `sv_idle=16`.

Revoked rows remain by design; the important leak check is active rows.
