# SDD 0014: Strict Quality Gate

## Problem

The legacy project uses strict quality checks across frontend, backend, contracts, tests, security, and maintainability. The refactor workspace already has SDD/TDD tests, but it needs a single strict quality gate that can block poor changes before they become the new system baseline.

The refactor must keep ordinary `npm test` fast and Docker-free, while adding a stronger pre-merge gate for formatting, architecture boundaries, static checks, contracts, connection budgets, and Go vet.

## Source Requirement References

- Root requirement: the whole system must be rebuilt as a reliable desktop teaching and research assistant, not a fragile proof of concept.
- Development rule: `docs/development/sdd-tdd.md` requires specs, tests, runtime config, rollback, and performance evidence.
- Whole-system invariant: modules are execution slices; each slice must preserve the whole-system architecture.
- Legacy evidence: original project uses strict lint, type, test, security, coverage, and quality summary scripts.

## Scope

In scope:

- Add a strict `npm run quality` command.
- Keep `npm test` Docker-free and suitable for fast local iteration.
- Add source quality checks:
  - Go formatting drift.
  - Go vet.
  - oversized source file threshold.
  - TODO/FIXME/HACK markers in runtime source.
  - clean architecture import boundaries for domain/usecase layers.
- Add contract and capacity gates:
  - identity access contract audit.
  - identity session runtime profile audit.
  - direct-limited connection budget.
  - PgBouncer connection budget.
- Write a JSON quality summary report.

Out of scope:

- Installing Python model/training dependencies.
- Running Docker or live PostgreSQL by default.
- Enforcing UI lint rules before a TypeScript UI slice exists in this workspace.
- Reusing legacy Python quality scripts directly.

## Contracts

- Script: `npm run quality`.
- Tool: `tools/quality-gate.mjs`.
- Report: `reports/quality-gate.current.json`.

## Acceptance Criteria

- Tool tests prove the gate rejects oversized files.
- Tool tests prove the gate rejects runtime TODO/FIXME/HACK markers.
- Tool tests prove inner domain/usecase layers cannot import HTTP, PostgreSQL, or adapter packages.
- Tool tests prove the command plan includes tests, Go vet, identity audits, and both connection budgets.
- `npm test` passes.
- `npm run quality` passes and writes `reports/quality-gate.current.json`.

## Rollback

Remove the `quality` script and `tools/quality-gate.mjs`. Existing `npm test` remains the fast fallback quality gate.

## Observability And Performance Evidence

Each quality run records:

- generated time.
- static check results.
- command gate results.
- elapsed time.
- pass/fail status.
