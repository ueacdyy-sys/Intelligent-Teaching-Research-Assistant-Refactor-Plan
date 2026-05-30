# SDD 0080: Performance Evidence Registry

## Problem

The refactor already has performance profiles, connection budgets, and focused
benchmark reports, but the evidence is still scattered across independent JSON
files. A performance conclusion can therefore omit the PostgreSQL/PgBouncer
settings, workload class, metric semantics, rollback note, or next action that
made the conclusion meaningful.

That gap is dangerous for a whole-system refactor. The project needs to decide
whether the current system can support very high concurrency, which configuration
limits it, and which module should move next. Those decisions must be based on a
machine-readable evidence registry rather than ad hoc report reading.

## Source Requirement References

- Root requirement: teaching, research, student, and agent workflows must remain
  stable as the system becomes more capable.
- Root requirement: public/private knowledge bases and student archives need
  efficient retrieval without leaking data across node boundaries.
- Refactor backlog P0a: record PostgreSQL settings in every performance report.
- Whole-system module map: Observability And Operations starts with performance
  profile gates and ends with reports, dashboards, and alert thresholds.
- Whole-system invariant: every migrated module keeps a rollback route until the
  new path is proven with current evidence.

## Scope

In scope:

- Add a performance evidence registry contract.
- Register current performance and performance-adjacent evidence reports.
- Require every registry entry to identify its source command, module slice,
  workload type, runtime profile, status, key metrics, and rollback or next
  action.
- Require PostgreSQL and PgBouncer settings for database-backed performance
  evidence, or an explicit non-database reason for contract-only evidence.
- Add an executable audit and include it in strict quality.

Out of scope:

- Running Docker or live load tests in `npm test`.
- Changing PostgreSQL, PgBouncer, Go, Rust, Node, or legacy runtime settings.
- Creating dashboards or alerting infrastructure.
- Replacing existing benchmark runners.
- Treating contract-only gates as load-test results.

## Contracts

Schema:

- `contracts/ops/performance-evidence-registry.schema.json`

Current registry:

- `contracts/ops/performance-evidence-registry.current.json`

Tooling:

- `tools/performance-evidence-registry-audit.mjs`
- `tools/performance-evidence-registry-audit.test.mjs`
- `reports/performance-evidence-registry.current.json`

## Acceptance Criteria

- `node --test tools/performance-evidence-registry-audit.test.mjs` fails before
  the audit tool exists.
- The registry contains at least one database-backed performance profile entry.
- Database-backed entries include PostgreSQL settings and PgBouncer settings.
- Contract-only or dependency-only entries include an explicit non-database
  rationale.
- Every registry entry has a source command, source report path, module slice,
  workload type, runtime profile, status, metric summary, and rollback or next
  action.
- Every source report path points to a current report file.
- Current evidence includes `reports/pgbouncer-perf-profile.current.json`,
  `reports/knowledge-retrieval-benchmark.current.json`,
  `reports/ai-worker-runtime-dependency-profile.current.json`, and
  `reports/quality-gate.current.json`.
- `npm run audit:performance-evidence` passes and writes
  `reports/performance-evidence-registry.current.json`.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, lockfile, SQL table, model, OCR, RAG, embedding,
  vector database, or training dependency is added.

## Rollback

Remove the performance evidence registry contract, current registry, audit tool,
focused tests, generated current report, package audit script, quality-gate
entry, structure verifier entries, and this SDD. Existing performance profiles,
connection budgets, benchmark runners, and quality gates remain unchanged.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused performance evidence registry audit test result after implementation.
- `npm run audit:performance-evidence` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
- confirmation that this gate registered evidence only and did not change live
  runtime configuration.
