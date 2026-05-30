# P8 PgBouncer Routed Current Profile

## Summary

Added SDD 0081 and promoted the refactor-owned PgBouncer override from
`proposed` evidence into the current performance profile.

The current profile now proves the configuration path that was previously the
main performance bottleneck:

- Backend PostgreSQL host: `pgbouncer-perf`.
- Backend PostgreSQL port: `6432`.
- Backend `DB_POOL_SIZE`: `2`.
- Backend `DB_MAX_OVERFLOW`: `0`.
- Backend startup depends on `pgbouncer-perf`.
- PostgreSQL profile remains `max_connections=300`, `shared_buffers=1GB`.
- PgBouncer remains transaction pooling with `max_db_connections=90`.

## What Changed

- `contracts/config/pgbouncer-perf-profile.current.json` now includes
  `infra/perf/docker-compose.pgbouncer.override.yml`.
- `npm run audit:pgbouncer-perf:current` no longer uses `--allow-fail`.
- Strict quality now runs `pgbouncer current performance profile audit` before
  `performance evidence registry audit`.
- The performance evidence registry marks the current PgBouncer evidence as
  `READY`.

## Interpretation

This removes the known configuration blocker that made earlier write-heavy and
mixed profiles unfair: the backend is no longer modeled as directly consuming
PostgreSQL server connections.

This is still not a live concurrency ceiling. The next performance slice should
run Docker-backed mixed read/write load against the routed profile and record
RPS, P95, P99, error rate, CPU, memory, PgBouncer client/server counts, and
`pg_stat_activity`.

## Verification

Red focused test:

- `node --test tools/pgbouncer-perf-profile-audit.test.mjs tools/quality-gate.test.mjs`
- Failed because current profile was `NEEDS_REMEDIATION` and quality did not run
  the PgBouncer current audit.

Focused and strict gates:

- `node --test tools/pgbouncer-perf-profile-audit.test.mjs tools/quality-gate.test.mjs`: passed.
- `npm run audit:pgbouncer-perf:current`: passed, readiness `READY`.
- `npm run audit:performance-evidence`: passed, current PgBouncer evidence `READY`.
- `npm test`: passed, 100 Node tool tests plus Go and Rust test suites.
- `npm run quality`: passed, including `pgbouncer current performance profile audit`.
- Rust build output `services/agent-harness/target`: removed and verified absent.

## Drift Check

No package dependency, lockfile, SQL table, model, OCR, RAG, embedding, vector
database, or training dependency was added.
