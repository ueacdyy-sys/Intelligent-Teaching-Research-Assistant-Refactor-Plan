# SDD 0004: Legacy DB Pool Remediation Plan

## Problem

The legacy DB pool audit found three high-risk synchronous SQLAlchemy default QueuePool sites. The audited worst-case budget reaches `planned=1156` against the current safe limit of `65`.

The next step is to convert audit findings into a concrete remediation plan and target connection budget profiles before changing legacy code or infrastructure.

## Scope

In scope:

- Generate remediation actions from `reports/legacy-db-pool-audit.current.json`.
- Produce target connection budget profiles for candidate deployment modes.
- Keep the plan explicit about which files must change in the legacy backend.
- Keep the plan testable with existing budget tooling.

Out of scope:

- Editing the legacy backend in this slice.
- Deploying PgBouncer in this slice.
- Running combined load tests before the budget gate passes.

## Contracts

Plan schema:

`contracts/config/legacy-db-pool-remediation.schema.json`

Budget profiles:

- `contracts/config/connection-budget.proposed-direct-limited.json`
- `contracts/config/connection-budget.proposed-pgbouncer-transaction.json`

Plan command:

```powershell
npm run plan:legacy-db-pools
```

Output report:

`reports/legacy-db-pool-remediation.current.json`

## Candidate Modes

### Direct-Limited Mode

Use direct PostgreSQL, reduce legacy async pool to 2 per worker, and convert sync helper persistent exposure to zero or tightly bounded behavior.

This mode is simpler but still has connection churn risk if sync helpers are converted to `NullPool` without PgBouncer.

### PgBouncer Transaction Mode

Route legacy backend and Go gateway through PgBouncer transaction pooling. Keep PostgreSQL server connections bounded by PgBouncer while client processes can open short-lived logical connections.

This is the recommended performance-test mode before combined high concurrency.

## Acceptance Criteria

- Remediation plan lists all high-risk sync engine sites.
- Each high-risk finding has an explicit action.
- Proposed profile passes the connection budget gate.
- Root `npm test` passes.
- The generated plan is written to `reports/legacy-db-pool-remediation.current.json`.

## Rollback

Remove the remediation schema, remediation tool, remediation tests, proposed
connection-budget profiles, generated remediation report, and
`plan:legacy-db-pools` script. Keep the legacy backend unchanged and return to
the SDD 0003 audit-only state.

## Follow-Up

After this plan is generated and verified, implement one of:

- legacy code patch to make sync helper pooling explicit
- PgBouncer perf compose profile
- both, with separate performance evidence
