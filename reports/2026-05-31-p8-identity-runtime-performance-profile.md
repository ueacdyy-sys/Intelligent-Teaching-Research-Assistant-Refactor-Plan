# P8 Identity Runtime Performance Profile

## Summary

Added SDD 0083 and aligned the identity-only Docker runtime profile with the
current PgBouncer performance profile.

The runtime profile now uses:

- PostgreSQL `max_connections=300`
- PostgreSQL `shared_buffers=1GB`
- PostgreSQL `effective_cache_size=3GB`
- PostgreSQL `work_mem=16MB`
- PgBouncer `max_db_connections=90`
- PgBouncer `default_pool_size=48`
- PgBouncer `reserve_pool_size=16`

## Performance Interpretation

This change removes the configuration mismatch found in SDD 0082, but it does
not prove ultra-high concurrency.

Live evidence after the profile change:

- 320 concurrency, 640 operations per phase: `PASSED`.
- 360 concurrency, 720 operations per phase: `FAILED` in `passwordLogin` with
  connection refusals.
- 360 concurrency with `SESSION_DB_MAX_CONNS=32`: also failed, so simply
  raising the application DB pool is not the next useful fix.

The current evidence points away from PostgreSQL/PgBouncer capacity as the
primary 360-concurrency blocker. The next bottleneck to test is the single
local gateway ingress path. The next performance slice should add a
multi-worker or load-balanced gateway benchmark profile rather than only
raising database settings again.

## Files

- `docs/sdd/0083-identity-runtime-performance-profile.md`
- `infra/perf/docker-compose.identity-session.yml`
- `infra/perf/identity-session-pgbouncer.ini`
- `tools/identity-session-runtime-profile-audit.mjs`
- `tools/identity-session-runtime-profile-audit.test.mjs`
- `reports/identity-session-runtime-profile.current.json`
- `reports/identity-http-benchmark.current.json`
- `reports/identity-http-benchmark.concurrency360.json`
- `contracts/ops/performance-evidence-registry.current.json`

## Verification

Red focused test:

- `node --test tools/identity-session-runtime-profile-audit.test.mjs`: failed
  before the audit enforced PostgreSQL and PgBouncer tuned profile capacity.

Focused and live checks:

- `node --test tools/identity-session-runtime-profile-audit.test.mjs`: passed.
- `npm run audit:identity-session-runtime`: passed, readiness `READY`.
- `npm run perf:identity-session:up`: started tuned Docker profile.
- `npm run test:identity-session:pgbouncer`: passed.
- `docker exec ita-identity-session-postgres psql ... "show max_connections; show shared_buffers; show effective_cache_size; show work_mem;"`: confirmed `300`, `1GB`, `3GB`, and `16MB`.
- `docker exec -e PGPASSWORD=ueacd ita-identity-session-pgbouncer psql ... "show config;"`: confirmed PgBouncer `max_db_connections=90`.
- `npm run bench:identity-http:pgbouncer -- --concurrency 320 --operations 640 --out reports/identity-http-benchmark.current.json --timeout 300s --startup-timeout-ms 180000`: passed.
- `npm run bench:identity-http:pgbouncer -- --concurrency 360 --operations 720 --out reports/identity-http-benchmark.concurrency360.json --timeout 300s --startup-timeout-ms 180000`: failed and wrote structured evidence.
- `npm run bench:identity-http:pgbouncer -- --concurrency 360 --operations 720 --session-db-max-conns 32 --out reports/identity-http-benchmark.concurrency360-pool32.json --timeout 300s --startup-timeout-ms 180000`: failed as an exploratory check; the temporary report was not kept as registry evidence.
