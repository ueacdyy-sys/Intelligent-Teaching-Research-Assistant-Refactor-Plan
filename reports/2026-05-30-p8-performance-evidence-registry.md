# P8 Performance Evidence Registry

## Summary

Added SDD 0080 and an executable performance evidence registry gate for the
whole-system refactor.

The gate does not run Docker in `npm test` and does not change live runtime
configuration. It registers the current evidence needed to judge performance:

- PgBouncer performance profile status and PostgreSQL/PgBouncer settings.
- Knowledge retrieval benchmark metrics.
- AI worker baseline dependency isolation metrics.
- Strict quality gate status.

## Current Performance Interpretation

The current PgBouncer performance profile remains `NEEDS_REMEDIATION`.

The recorded bottleneck is configuration evidence, not a proved database
capacity ceiling:

- PostgreSQL profile: `max_connections=300`, `shared_buffers=1GB`.
- PgBouncer profile: transaction pooling on port `6432`,
  `max_db_connections=90`.
- Current backend profile still routes to `postgres-perf:5432`.
- Current backend pool size is `DB_POOL_SIZE=3`, while the combined performance
  profile target is `DB_POOL_SIZE<=2`.

The next useful performance slice is to apply the PgBouncer override and run a
live database-backed concurrency benchmark against the routed profile.

## Files

- `docs/sdd/0080-performance-evidence-registry.md`
- `contracts/ops/performance-evidence-registry.schema.json`
- `contracts/ops/performance-evidence-registry.current.json`
- `tools/performance-evidence-registry-audit.mjs`
- `tools/performance-evidence-registry-audit.test.mjs`
- `reports/performance-evidence-registry.current.json`
- `reports/quality-gate.current.json`

## Verification

Red focused test:

- `node --test tools/performance-evidence-registry-audit.test.mjs`
- Failed with `ERR_MODULE_NOT_FOUND` before implementation.

Focused and strict gates:

- `node --test tools/performance-evidence-registry-audit.test.mjs`: passed.
- `npm run audit:performance-evidence`: passed, readiness `READY`.
- `npm test`: passed, 99 Node tool tests plus Go and Rust test suites.
- `npm run quality`: passed, now includes `performance evidence registry audit`.
- Rust build output `services/agent-harness/target`: removed and verified absent.

## Drift Check

No package dependency, lockfile, SQL table, model, OCR, RAG, embedding, vector
database, or training dependency was added.
