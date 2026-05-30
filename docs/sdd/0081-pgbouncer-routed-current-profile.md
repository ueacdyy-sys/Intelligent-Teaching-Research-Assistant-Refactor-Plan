# SDD 0081: PgBouncer Routed Current Profile

## Problem

SDD 0080 registered the current performance evidence and made the bottleneck
explicit: the PgBouncer performance profile exists, but the current profile
still reports `NEEDS_REMEDIATION` because backend traffic is observed as direct
PostgreSQL traffic on `postgres-perf:5432` with `DB_POOL_SIZE=3`.

The refactor workspace already has a safe additive override that routes
`backend-perf` through `pgbouncer-perf:6432` and caps per-worker database pools.
Leaving that override only in the proposed profile means strict quality can keep
passing without proving that the current high-concurrency profile is actually
routed through PgBouncer.

## Source Requirement References

- Root requirement: the desktop teaching/research assistant must run efficiently
  and stably as capabilities expand.
- Refactor backlog P0b: set PostgreSQL/PgBouncer strategy and reduce write-path
  connection pressure.
- SDD 0005: combined performance tests should use the refactor-owned PgBouncer
  override.
- SDD 0080: performance evidence must include PostgreSQL/PgBouncer settings and
  the next action for bottleneck evidence.
- Whole-system invariant: local performance secrets use `ueacd`.

## Scope

In scope:

- Promote the refactor-owned PgBouncer override into the current performance
  profile evidence.
- Make `npm run audit:pgbouncer-perf:current` fail on remediation instead of
  using `--allow-fail`.
- Add the current PgBouncer performance profile audit to strict quality before
  the performance evidence registry audit.
- Update the performance evidence registry so the current PgBouncer evidence is
  `READY` and points at the routed profile settings.

Out of scope:

- Running Docker or live load tests in `npm test`.
- Editing the legacy application source or base legacy compose file.
- Changing PostgreSQL capacity numbers without benchmark evidence.
- Adding model, OCR, RAG, embedding, vector database, or training dependencies.

## Contracts

Updated profile:

- `contracts/config/pgbouncer-perf-profile.current.json`

Evidence registry:

- `contracts/ops/performance-evidence-registry.current.json`

Tooling and reports:

- `tools/pgbouncer-perf-profile-audit.test.mjs`
- `tools/quality-gate.mjs`
- `tools/quality-gate.test.mjs`
- `reports/pgbouncer-perf-profile.current.json`
- `reports/performance-evidence-registry.current.json`

## Acceptance Criteria

- `node --test tools/pgbouncer-perf-profile-audit.test.mjs
  tools/quality-gate.test.mjs` fails before implementation.
- Current PgBouncer profile includes
  `infra/perf/docker-compose.pgbouncer.override.yml`.
- Current PgBouncer profile readiness is `READY`.
- Current backend route is `pgbouncer-perf:6432`.
- Current backend pool target is `DB_POOL_SIZE=2` and `DB_MAX_OVERFLOW=0`.
- `npm run audit:pgbouncer-perf:current` exits non-zero if the profile
  regresses.
- Strict quality runs the current PgBouncer performance profile audit before the
  performance evidence registry audit.
- `npm run audit:performance-evidence` reports current PgBouncer evidence as
  `READY`.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, lockfile, SQL table, model, OCR, RAG, embedding,
  vector database, or training dependency is added.

## Rollback

Remove the current profile override reference, restore `--allow-fail` on
`audit:pgbouncer-perf:current`, remove the quality-gate command entry, and
return the performance evidence registry entry to `NEEDS_REMEDIATION`. The
additive override file itself remains available for manual performance runs.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- current PgBouncer profile audit result.
- performance evidence registry audit result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
- confirmation that no Docker-dependent command was added to `npm test`.
