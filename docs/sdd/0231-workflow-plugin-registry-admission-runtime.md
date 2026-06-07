# SDD 0231: Workflow Plugin Registry Admission Runtime

## Problem

The immutable root requirements allow generated workflows/plugins to move through automatic tests and human performance/effect review, then become reusable system assets. The refactor already has draft intent, sandbox result, and human approval evidence, plus a static registry admission validator. It still needs a runtime command boundary that persists approved registry entries without turning generated code into executable host code.

## Scope

Add `WorkflowRegistryCommandPort.recordWorkflowPluginRegistryAdmission` as a dry-run-only registry admission runtime.

The runtime consumes a generated workflow/plugin draft, a passing sandbox result, and an approved human performance/effect review. It records admission evidence and persists a registry entry as append-only JSONL only when the static admission validator returns `ALLOW_SAVE`. It does not publish workflows/plugins, expose execution candidates, or execute generated code on the host.

## Contracts

- Only internal service or admin principals with `ADMIN_SYSTEM` may record registry admission.
- Students, remote channels, and ordinary teacher reviewers cannot record registry admission.
- Registry admission must reference draft intent, sandbox result, human approval, SharedContext, GuardrailResult, RouteDecision, input hash, output summary, rollback plan, audit trace, and idempotency key.
- Drafts must remain `DRAFT`, `DRY_RUN_ONLY`, `sandboxRequired=true`, `humanApprovalRequired=true`, `allowedHostAccess=NONE`, and `registrySaveAllowed=false`.
- Sandbox runs must be `PASS`, prove `executedInSandbox=true`, `noHostWrite=true`, `networkPolicy=DEFAULT_DENY`, and contain only passing tests.
- Human approval must be `APPROVED`, `registrySaveDecision=ALLOW_SAVE`, `performanceReviewed=true`, and `effectReviewed=true`.
- Persisted registry entries must keep `executionMode=DRY_RUN_ONLY` and `localExecutionEnabled=false`.
- Idempotency replay returns the existing command result and does not append another registry entry.

## Acceptance Criteria

- Runtime tests cover approved dry-run registry persistence, non-admin teacher rejection, revision approval rejection, failed sandbox rejection, and idempotency replay.
- Audit locks dry-run registry entry contract, internal admin writer authorization, full evidence requirements, append-only persistence, no publish/execution/host run behavior, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-registry-admission-runtime.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-registry-admission-runtime`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice writes small append-only registry evidence and does not change the production hot path. It should not reopen broad production pressure testing. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the registry admission runtime, tests, audit, npm script, quality-gate entry, root workflow report check, structure verifier entries, generated report, and this SDD. Existing registry command-log and registry JSONL entries remain append-only dry-run catalog evidence and do not publish workflows/plugins.
