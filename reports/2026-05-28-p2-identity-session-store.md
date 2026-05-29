# P2 Identity Session Store

## Decision

Identity And Access now has a durable PostgreSQL `SessionStore` adapter behind the existing usecase port. The composition root keeps the in-memory store as the default rollback path and switches to PostgreSQL only when `SESSION_DATABASE_URL` is set.

## Root Requirement Trace

- Teacher desktop login, student app login, and remote/social command entry need stable principal/session context across the whole system.
- Remote social entry remains command-submit only and still requires Agent Harness approval before local device control.
- Student app principals still have no private knowledge access.

## Performance And Operations

- `SESSION_DB_MAX_CONNS` defaults to `8` after the first concurrency benchmark showed `4` as a limiting pool size.
- Proposed direct-limited and PgBouncer connection budgets now include the identity gateway pool.
- Durable session mode is suitable for multi-worker tests; memory mode remains useful for local smoke and rollback.

## Verification

- Focused adapter test: `go test ./services/identity-access-gateway/internal/adapter/postgres`
- Identity gateway test: `go test ./services/identity-access-gateway/...`
- Root gate: `npm test`
- Identity contract audit: `npm run audit:identity-access`
- Connection budget checks:
  - direct-limited profile: planned `64`, safe limit `65`
  - PgBouncer profile: planned `80`, safe limit `190`

## Follow-Up

- Add live PostgreSQL integration tests in the Docker/PgBouncer performance profile.
- Record P95/P99 for access-token lookup, refresh rotation, and revoked-token lookup under mixed teacher/student/remote traffic.
