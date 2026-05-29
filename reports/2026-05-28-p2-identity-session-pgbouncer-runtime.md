# P2 Identity Session PgBouncer Runtime

## Decision

Identity And Access now has a refactor-owned PostgreSQL plus PgBouncer runtime profile that avoids the currently occupied dev ports. It is intentionally identity-only so durable session behavior can be proven before full mixed legacy plus Go performance tests.

## Runtime Profile

- Compose: `infra/perf/docker-compose.identity-session.yml`
- PostgreSQL host port: `15432`
- PgBouncer host port: `16432`
- PostgreSQL 18 volume target: `/var/lib/postgresql`
- PgBouncer mode: `transaction`
- PgBouncer server connection ceiling: `32`
- Local secrets: `ueacd`

## Commands

```powershell
npm run audit:identity-session-runtime
npm run perf:identity-session:up
npm run test:identity-session:pgbouncer
npm run perf:identity-session:down
```

Use `npm run perf:identity-session:reset` only when the identity-only test database volume needs to be recreated.

## Verification

- TDD gate: `node --test tools/identity-session-runtime-profile-audit.test.mjs`
- Runtime profile audit: `node tools/identity-session-runtime-profile-audit.mjs --out reports/identity-session-runtime-profile.current.json`
- Root gate: `npm test`
- Live runtime profile start: `npm run perf:identity-session:up`
- Live PgBouncer session lifecycle: `npm run test:identity-session:pgbouncer`
- Cleanup: `npm run perf:identity-session:down`

## Debug Note

The first start attempt exposed a PostgreSQL 18 Docker behavior: mounting the volume at `/var/lib/postgresql/data` exits with a layout error. The profile now mounts at `/var/lib/postgresql`, and the audit gate has a regression check for that target.

## Next Evidence

Add concurrent identity lifecycle benchmarking for access lookup, refresh rotation, and revoke under teacher/student/remote mixed traffic.
