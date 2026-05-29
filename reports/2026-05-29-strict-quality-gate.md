# Strict Quality Gate

## Decision

The refactor workspace now has a strict pre-merge quality gate:

```powershell
npm run quality
```

This keeps the fast `npm test` path intact and adds higher-confidence checks before a module slice is considered merge-ready.

## Legacy Quality Lessons Kept

The original project used strict frontend and backend checks, including type checking, linting, pytest, mypy, ruff, bandit, coverage, complexity, and a quality summary. The refactor workspace keeps the same habit without installing Python model/training dependencies or copying legacy tooling that does not apply to the current Go/Node contract workspace.

## Current Gate Coverage

- `npm test`
- `go vet ./services/conversation-write-gateway/... ./services/identity-access-gateway/...`
- `gofmt -l` drift check for Go service code
- source file-size threshold
- runtime TODO/FIXME/HACK/XXX marker check
- clean architecture inner-layer import check
- `npm run audit:identity-session-runtime`
- `npm run audit:identity-access`
- `npm run budget:connections:direct-limited`
- `npm run budget:connections:pgbouncer`

## Evidence

Latest run:

- Report: `reports/quality-gate.current.json`
- Result: `allPassed=true`
- Elapsed: `137007ms`
- Static findings: `0`

Command results:

| Gate | Result | Elapsed |
| --- | --- | ---: |
| `npm test` | PASS | 69118ms |
| `go vet` | PASS | 65071ms |
| `identity session runtime audit` | PASS | 675ms |
| `identity access contract audit` | PASS | 733ms |
| `direct-limited connection budget` | PASS | 670ms |
| `pgbouncer connection budget` | PASS | 630ms |

## Follow-Up

When the TypeScript UI/SDK slice lands, extend `npm run quality` with type-check and lint gates. When Rust Agent Harness lands, extend it with Rust format, clippy, and tests.
