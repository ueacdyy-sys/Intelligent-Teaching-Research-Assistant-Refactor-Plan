# SDD 0208: Production10k Teaching Concurrency Budget

## Problem Statement

The `production10k` target step keeps the same root pressure shape:
`identity=192/768`, `conversation=2304/9216`, `teaching=384/1536`, and
`targetReadWriteRps=10000`. The prior default used 16 Teaching gateways with
16 DB connections each, but two-sample evidence still failed the Root SLO tail
latency guardrail at `maxP99=329.88ms`.

Follow-up diagnostics showed the Teaching list query is not intrinsically slow:
the service schema creates `idx_teaching_archive_items_owner_material_page`, and
direct `EXPLAIN ANALYZE` uses that index for the `ownerType=TEACHING` and
`materialType=QUIZ` list path. The higher-latency case appears under full
mixed load, where too many Teaching workers and DB connections amplify shared
database scheduling and pool tail latency.

Existing target-bearing evidence shows the more balanced profile
`teachingGatewayCount=4`, `teachingDbMaxConns=12`,
`teachingDbMinConns=12`, and `teachingDbPrewarmConns=12` passed a two-sample
`production10k` run at `22975.85` read/write RPS, `0` errors, and
`maxP99=269.01ms`.

## Source Requirement References

- Root requirements remain immutable:
  `C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`.
- Modules are execution slices of the whole-system refactor, not standalone
  PoCs.
- Root SLO remains production10k sustained mixed read/write `>=10000 RPS`,
  `0` errors, and max P99 `<=300ms`.
- Local secrets remain `ueacd` and must be masked in reports.

## Scope

- Change the `production10k` default Teaching worker budget to 4 gateways.
- Change the `production10k` default Teaching DB pool to 12 max/min/prewarm
  connections per gateway.
- Keep the same target step concurrency, operation counts, throughput target,
  Docker/WSL load-generator requirements, and Root SLO guardrails.
- Keep Teaching shared PostgreSQL timeline diagnostics so future failures show
  wait events during the hot phase.

## Non-Scope

- Lowering the Root SLO or target read/write pressure.
- Removing Teaching from the full-system workload.
- Claiming sub-10ms production behavior.
- Increasing PgBouncer or PostgreSQL caps without separate headroom evidence.

## Contracts Touched

- No public HTTP contract changes.
- `contracts/sql/teaching-archive.sql` is aligned with the service schema by
  including the Teaching list composite index.

## Acceptance Criteria

- Tests prove `production10k` defaults use 4 Teaching gateways and a 12
  max/min/prewarm Teaching DB pool.
- Teaching contract SQL and service schema both include
  `idx_teaching_archive_items_owner_material_page`.
- A target-bearing two-sample `production10k` run keeps read/write RPS above
  10000, errors at 0, and max P99 within 300ms.
- Root SLO, system capacity, cross-module DB queue, and performance evidence
  audits are rerun before promotion.

## Rollback Plan

- Restore `production10k` Teaching defaults to 16 gateways and 16
  max/min/prewarm DB connections.
- Keep the composite index because it matches the Teaching list access pattern.

## Observability And Performance Evidence

- Official evidence files remain under `reports/`.
- Performance reports must include Docker/WSL runtime profiles.
- Teaching reports must include PgBouncer/PostgreSQL diagnostics when enabled,
  including PostgreSQL timeline samples during the workload.
