# SDD 0207: Teaching Shared DB Diagnostics And Pool Candidate

## Problem Statement

The production10k mixed workload can exceed 10k aggregate read/write RPS with zero errors, but the official Root SLO still fails when tail latency crosses 300ms. The latest two-sample diagnostic run showed `listArchiveItems` at `P99=330.64ms`, with `db.acquire P99=227.44ms`, while Teaching is configured as 16 gateways with only 16 database connections per gateway.

That evidence points to Teaching application pool queueing under a 384-concurrency list phase. The current system runner forwards PgBouncer/PostgreSQL diagnostics to Identity and Conversation, but not to Teaching, so a pool-size promotion would not have enough cross-module evidence.

## Source Requirement References

- Root requirements remain immutable: `C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`.
- Whole-system refactor constraint: modules are construction slices, not standalone PoCs.
- Root SLO target remains production10k sustained mixed read/write `>=10000 RPS`, zero errors, and max P99 `<=300ms`.
- All local secrets remain constrained to `ueacd` and must be masked in reports.

## Scope

- Forward shared PgBouncer and PostgreSQL diagnostic flags into the Teaching benchmark runner.
- Record Teaching PgBouncer/PostgreSQL diagnostic snapshots in Teaching benchmark reports.
- Use the resulting evidence to test Teaching database pool candidates such as 16x24 or 16x32.

## Non-Scope

- Changing root requirements.
- Adding training, vector database, or heavy model dependencies.
- Claiming ultra-high concurrency or sub-10ms production latency without Root SLO and audit evidence.
- Raising PgBouncer/PostgreSQL caps without explicit headroom evidence.

## Contracts Touched

- No public HTTP contract changes.
- Runner/report schema is extended with optional `pgbouncerDiagnostics` and `postgresDiagnostics` fields for Teaching benchmark evidence.

## Acceptance Criteria

- Node tests prove the system runner forwards shared DB diagnostics to Teaching.
- Teaching reports include masked PgBouncer/PostgreSQL diagnostics when enabled.
- A production10k candidate run records Teaching pool and shared database diagnostics.
- Any promoted pool setting must keep zero errors and max P99 within the Root SLO target.

## Rollback Plan

- Remove the Teaching diagnostic argument forwarding.
- Remove optional Teaching `pgbouncerDiagnostics` and `postgresDiagnostics` report enrichment.
- Restore the previous production10k Teaching pool defaults.

## Observability And Performance Evidence

- Evidence files must stay under `reports/`.
- Diagnostic reports must mask local secrets and database URLs.
- Performance promotion must use Docker/WSL multi-worker mixed read/write evidence, not an empty endpoint benchmark.
