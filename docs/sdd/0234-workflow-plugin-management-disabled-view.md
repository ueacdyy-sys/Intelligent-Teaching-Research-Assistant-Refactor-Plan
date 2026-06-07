# SDD 0234: Workflow Plugin Management Disabled View

## Problem

The immutable root requirements include workflow/plugin self-evolution, automatic tests, human review, and controlled registry admission. SDD 0232 blocks execution candidates and SDD 0233 blocks publication, but a future management surface could still make a dry-run registry entry look actionable. The refactor needs a machine-readable management view contract proving every risky workflow/plugin action is disabled until a future SDD explicitly enables safe execution and publication.

## Scope

Add `WorkflowManagementViewCommandPort.recordWorkflowPluginManagementDisabledView` as a control-plane evidence boundary.

The runtime consumes a dry-run registry entry, execution-isolation evidence, and publication-disabled evidence. It writes append-only command evidence for an admin workflow/plugin management surface where publish, enable local execution, create execution candidate, and expose marketplace are all disabled. It does not implement a real frontend UI, enable any UI action, publish workflows/plugins, expose a marketplace entry, expose execution candidates, launch processes, write to the host, or execute generated code.

## Contracts

- Only internal service or admin principals with `ADMIN_SYSTEM` may record management disabled views.
- Students, remote channels, and ordinary teacher reviewers cannot record management disabled views.
- Registry entries must be `ACTIVE`, `executionMode=DRY_RUN_ONLY`, and `localExecutionEnabled=false`.
- Execution isolation result must be `EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION` and must keep `candidateCount=0`, `executionCandidateAllowed=false`, `workflowPublishAllowed=false`, `localExecutionEnabled=false`, `processLaunchAllowed=false`, `hostWriteAllowed=false`, and `requiresFutureSdd=true`.
- Publication disabled result must be `WORKFLOW_PLUGIN_PUBLICATION_BLOCKED_BY_POLICY` and must keep `workflowPublishAllowed=false`, `pluginMarketplaceExposureAllowed=false`, `executionCandidateAllowed=false`, `localExecutionEnabled=false`, `processLaunchAllowed=false`, `hostWriteAllowed=false`, and `requiresFutureSdd=true`.
- The management view surface is `ADMIN_WORKFLOW_PLUGIN_MANAGEMENT`.
- The management view must show `DRY_RUN_ONLY`, `EXECUTION_CANDIDATES_DISABLED`, `PUBLICATION_DISABLED`, and `FUTURE_SDD_REQUIRED`.
- The management view must contain exactly four disabled actions: `publish`, `enableLocalExecution`, `createExecutionCandidate`, and `exposeMarketplace`.
- Evidence must include registry admission, execution isolation, publication disabled, human approval, sandbox result, audit trace, and idempotency key.
- Idempotency replay returns the existing command result and does not append another command-log record.

## Acceptance Criteria

- Runtime tests cover disabled management view recording, marketplace-enabled publication evidence rejection, execution-candidate exposure rejection, executable registry rejection, unauthorized principal rejection, and idempotency replay.
- Audit locks the disabled management view contract, internal admin writer authorization, upstream execution-isolation and publication-disabled dependencies, append-only/no-enable/no-execution behavior, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-management-disabled-view.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-management-disabled-view`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice writes small append-only control-plane evidence and does not change the production hot path. It should not reopen broad production pressure testing. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the management disabled view runtime, tests, audit, schema/example, npm script, quality-gate entry, root workflow report check, structure verifier entries, generated report, and this SDD. Existing command-log records remain append-only blocking evidence and do not enable workflow/plugin publishing, marketplace exposure, execution candidates, local execution, process launch, or host writes.
