# P5 Agent Harness Permission Manifest

## Decision

Agent Harness now has its first executable Rust slice: a permission manifest contract and a dry-run policy evaluator for local file, process, and browser actions.

The slice deliberately does not control the desktop yet. It creates the local trust boundary that later file/process/browser adapters must pass through.

## Root Requirement Link

The root requirements say the assistant can receive mobile/social commands and control desktop applications through the orchestrating agent. That capability is high risk, so the refactor now has a Rust-owned Harness boundary before any real local control code exists.

## Implemented Contract

- `contracts/harness/permission-manifest.schema.json`
- `contracts/harness/permission-manifest.current.json`
- `services/agent-harness`

Policy outcomes:

- `ALLOW_DRY_RUN`
- `APPROVAL_REQUIRED`
- `DENY`

Current behavior:

- admin-like principals with `DEVICE_LOCAL_CONTROL` can dry-run manifest-allowed local actions.
- remote/social principals with `requiresHarnessApproval=true` get `APPROVAL_REQUIRED`.
- principals without `DEVICE_LOCAL_CONTROL` are denied when approval is not required.
- unlisted process targets are denied.

## TDD Evidence

The Rust tests were written before implementation and failed against the placeholder crate because the public API did not exist:

- `evaluate_request`
- `ActionKind`
- `DecisionOutcome`
- `HarnessRequest`
- `PermissionManifest`
- `Principal`

After implementation, `cargo test --manifest-path services/agent-harness/Cargo.toml` passed with 4 policy tests.

## Quality Gate Update

Strict quality now includes the Rust slice:

- `npm test` runs `npm run test:rust`.
- `npm run quality` runs `cargo fmt --check` through static quality checks.
- `npm run quality` runs an explicit `cargo test` command.

Latest strict quality result:

- `npm test`: passed.
- `go vet`: passed.
- `cargo test`: passed.
- `identity session runtime audit`: passed.
- `identity access contract audit`: passed.
- direct-limited connection budget: passed.
- PgBouncer connection budget: passed.
- `reports/quality-gate.current.json`: `allPassed=true`
- quality elapsed: `138946ms`

## Rollback

Remove `services/agent-harness`, remove the Harness manifest contract files, and remove `npm run test:rust` plus the explicit `cargo test` quality command. No runtime route calls this crate yet.

## Next Evidence

Next Harness slice should add a dry-run audit evidence record so policy decisions can be persisted and inspected before any real local file/process/browser adapter is allowed.
