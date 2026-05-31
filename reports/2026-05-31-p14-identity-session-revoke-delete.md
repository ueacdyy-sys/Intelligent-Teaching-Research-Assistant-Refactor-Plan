# P14 Identity Session Revoke Delete

## Summary

Added SDD 0095 and changed PostgreSQL-backed Identity session revoke from
marking active rows with `revoked_at` to deleting matching active session rows.

This keeps the public revoke API and token invalidation semantics intact, while
preventing new revoked sessions from accumulating as live rows in
`identity_sessions`.

## Root Cause Evidence

After the SDD 0094 step-profile benchmark exposed a `refreshRotation` tail
latency spike, the persisted Identity performance PostgreSQL volume was
inspected:

| Metric | Value |
| --- | ---: |
| total_sessions | 451158 |
| active_sessions | 0 |
| revoked_sessions | 451158 |
| table_total_size | 539 MB |
| heap_size | 393 MB |
| identity_sessions_refresh_token_key | 42 MB |
| identity_sessions_access_token_key | 36 MB |
| identity_sessions_pkey | 35 MB |

The system had no active sessions, but the write path still carried hundreds of
thousands of invalidated token rows and global token index entries.

## Red Test

`go test ./services/identity-access-gateway/internal/adapter/postgres -run 'TestSessionStoreRevoke(InvalidatesTokens|OwnSessionUsesAccessAndSessionCondition)' -count=1 -v`
failed before implementation because both revoke paths still used
`UPDATE identity_sessions SET revoked_at = NOW()`.

## Implementation

- `RevokeSession` now deletes the matching active session row.
- `RevokeOwnSession` now deletes only when `session_id`, `access_token`,
  active state, and expiry match.
- Legacy rows with `revoked_at IS NOT NULL` remain invalid because read paths
  still filter on `revoked_at IS NULL`.
- Fake PostgreSQL tests now model row deletion instead of merely marking a row
  revoked.

## Verification

Focused checks:

- `go test ./services/identity-access-gateway/internal/adapter/postgres -run 'TestSessionStoreRevoke(InvalidatesTokens|OwnSessionUsesAccessAndSessionCondition|OwnSessionRejectsMismatchedAccessToken)' -count=1 -v`: passed
- `go test ./services/identity-access-gateway/internal/adapter/postgres -run Test -count=1 -v`: passed, with PostgreSQL integration skipped when env is absent
- `IDENTITY_SESSION_INTEGRATION_DATABASE_URL=postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable go test ./services/identity-access-gateway/internal/adapter/postgres -run TestSessionStorePostgresIntegrationLifecycle -count=1 -v`: passed against the live performance PostgreSQL/PgBouncer stack

Live HTTP smoke after implementation:

`npm run bench:identity-http:pgbouncer -- --concurrency 64 --operations 128 --out reports/identity-http-benchmark.revoke-delete-smoke.json --timeout 240s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Metric | Value |
| --- | ---: |
| passwordLogin.p95_ms | 156.36 |
| principalLookup.p95_ms | 55.73 |
| refreshRotation.p95_ms | 70.30 |
| revokeCycle.p95_ms | 62.13 |
| revokeCycle.login.p95_ms | 31.32 |
| revokeCycle.revoke.p95_ms | 27.46 |
| revokeCycle.revokedPrincipalLookup.p95_ms | 16.43 |

Session table row count did not grow during the smoke:

| Point | total_sessions | active_sessions | revoked_sessions |
| --- | ---: | ---: | ---: |
| before smoke | 451158 | 0 | 451158 |
| after smoke | 451158 | 0 | 451158 |

## Next Step

This stops new revoked-row accumulation, but it does not remove the existing
451158 legacy revoked rows or reclaim old table/index bloat. The next
operations slice should add an explicit retention cleanup or documented
performance reset path, then rerun the 4000-concurrency Dockerized benchmark on
a clean or pruned session table.
