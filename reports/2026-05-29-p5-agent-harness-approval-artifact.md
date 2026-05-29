# P5 Agent Harness Approval Artifact

## Decision

Agent Harness now has a contract-shaped approval artifact for `APPROVAL_REQUIRED` decisions.

This stays inside the safety boundary:

- remote principals still do not receive `DEVICE_LOCAL_CONTROL`.
- allow and deny decisions do not create approval artifacts.
- approval artifacts are `PENDING` only.
- approval artifacts can be persisted as append-only JSONL.
- this slice does not approve, reject, execute, or start a local action.

## Root Requirement Link

The root requirements allow mobile social commands to ask the desktop assistant to control local applications. This slice turns those remote local-control requests into reviewable approval artifacts instead of granting direct local control.

## Implemented Behavior

- `ApprovalArtifact` serializes to `contracts/harness/approval-artifact.schema.json`.
- `ApprovalStatus::Pending` is the only supported status.
- `ApprovalArtifact::from_decision` returns an artifact only for `APPROVAL_REQUIRED`.
- `JsonlApprovalStore` appends and reads approval artifacts in order.
- Invalid approval JSONL returns `EvidenceStoreError::Json`.
- Shared JSONL helpers are reused by evidence and approval stores.

## TDD Evidence

The new approval tests failed before implementation because the approval types did not exist:

- unresolved import `ApprovalArtifact`.
- unresolved import `ApprovalStatus`.
- unresolved import `JsonlApprovalStore`.

After implementation, the targeted test passed:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml --test approval_artifact
```

Result:

- 5 approval artifact tests passed.

## Quality Gate Update

The structure gate now requires:

- `docs/sdd/0024-agent-harness-approval-artifact.md`
- `contracts/harness/approval-artifact.schema.json`
- `contracts/harness/approval-artifact.example.json`
- `services/agent-harness/tests/approval_artifact.rs`

## Verification

Targeted:

- `cargo test --manifest-path services/agent-harness/Cargo.toml --test approval_artifact`: passed.

Daily:

- `npm test`: passed.

Strict quality gate:

- `npm test`: passed.
- `go vet`: passed.
- `cargo test`: passed.
- identity session runtime audit: passed.
- identity access contract audit: passed.
- direct-limited connection budget: passed.
- PgBouncer connection budget: passed.
- `allPassed=true`.
- quality elapsed: `139135ms`.

## Rollback

Remove `ApprovalArtifact`, `ApprovalStatus`, `JsonlApprovalStore`, approval contracts, and `approval_artifact.rs`. Existing dry-run, persistent evidence, and metadata preview paths remain valid.

## Next Evidence

Next Harness slice should add an approval decision transition model for local reviewers: approve or reject a pending artifact without allowing remote principals to execute local actions directly.
