# P5 Agent Harness Dry-Run Adapters

## Decision

Agent Harness now exposes a `DryRunHarness` facade that evaluates a local action request, appends audit evidence, and returns a dry-run report in one call.

This is still not real local control:

- no file read or write.
- no process start.
- no browser navigation.
- no shell command execution.
- no durable evidence store.

## Root Requirement Link

The root requirements say the assistant can control desktop applications through the orchestrating agent. This slice moves toward that capability by proving the local-control decision path end to end without side effects.

## Implemented Behavior

- Allowed dry-run file requests return `would_execute=true` and append evidence.
- Denied process requests return `would_execute=false` and append evidence.
- Remote/social approval-required requests return `would_execute=false` and append evidence.
- Browser target matching now denies lookalike origins such as `http://127.0.0.1.evil.local`.

## TDD Evidence

The new dry-run tests failed before implementation because `DryRunHarness` did not exist.

After implementation, `cargo test --manifest-path services/agent-harness/Cargo.toml` passed with 12 Rust tests:

- 4 permission manifest tests.
- 4 audit evidence tests.
- 4 dry-run harness tests.

## Quality Gate Update

The structure gate now requires:

- `docs/sdd/0019-agent-harness-dry-run-adapters.md`
- `services/agent-harness/tests/dry_run_harness.rs`

## Verification

Targeted:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml
```

Result:

- 12 Rust tests passed.

Full gates are recorded in `reports/quality-gate.current.json` after the final quality run.

Latest strict quality result:

- `npm test`: passed.
- `go vet`: passed.
- `cargo test`: passed.
- identity session runtime audit: passed.
- identity access contract audit: passed.
- direct-limited connection budget: passed.
- PgBouncer connection budget: passed.
- `allPassed=true`
- quality elapsed: `138626ms`

## Rollback

Remove `DryRunHarness`, `DryRunReport`, and `dry_run_harness.rs`. The lower-level permission evaluator and audit evidence records remain valid.

## Next Evidence

Next Harness slice should add a durable local evidence store or a no-side-effect filesystem metadata adapter behind the same dry-run facade.
