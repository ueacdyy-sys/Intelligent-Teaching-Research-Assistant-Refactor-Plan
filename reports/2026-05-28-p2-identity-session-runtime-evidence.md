# P2 Identity Session Runtime Evidence

## Decision

Identity And Access now has an opt-in live PostgreSQL lifecycle test for durable sessions. The test is skipped unless `IDENTITY_SESSION_INTEGRATION_DATABASE_URL` is set, so the root gate stays runnable without Docker while the PgBouncer profile can still prove real adapter behavior.

## Root Requirement Trace

- Teacher login, student login, and remote/social command entry need durable principal context before multi-worker routing is credible.
- The runtime check exercises the same session lifecycle needed by teacher desktop, student app, and remote command grants.

## Implementation Notes

- Added `postgres.NewPoolDB` so the gateway and integration test use the same pgxpool adapter wrapper.
- Added `TestSessionStorePostgresIntegrationLifecycle`.
- Added root script `npm run test:identity-session:postgres`.

## Verification

- Adapter package with skipped live test: `go test ./services/identity-access-gateway/internal/adapter/postgres`
- Root gate: `npm test`
- Opt-in script without DSN: `npm run test:identity-session:postgres` skips `TestSessionStorePostgresIntegrationLifecycle` and passes.
- PgBouncer profile audit: `npm run audit:pgbouncer-perf:proposed` reports `READY`.
- Identity contract audit: `npm run audit:identity-access` reports `READY`.
- Direct-limited connection budget: `npm run budget:connections:direct-limited` passes at planned `64`, safe limit `65`.

## Local Docker Observation

Current Docker containers expose `ita-postgres-dev` on `5433` and a 24-worker legacy backend on `12345`, but no PgBouncer container is running. Do not start the current perf compose blindly while `5433` is occupied; either stop the dev PostgreSQL profile intentionally or add a refactor-owned identity-only PgBouncer compose that uses a non-conflicting host port.

## Next Evidence

Run the script with PgBouncer available:

```powershell
$env:IDENTITY_SESSION_INTEGRATION_DATABASE_URL="postgres://app_user:ueacd@127.0.0.1:6432/intelligent_teaching_assistant?sslmode=disable"
npm run test:identity-session:postgres
```

Then capture P95/P99 for lookup, refresh rotation, and revoke under mixed teacher/student/remote traffic.
