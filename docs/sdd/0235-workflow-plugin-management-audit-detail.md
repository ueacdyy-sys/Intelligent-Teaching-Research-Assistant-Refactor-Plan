# SDD 0235: Workflow Plugin Management Audit Detail

## Problem

SDD 0234 proves workflow/plugin management controls are disabled, but a real product still needs an administrator-facing explanation of why they are disabled. Without a read-only audit detail projection, future UI work could show grey buttons without the evidence chain, making the workflow/plugin self-evolution path hard to review, debug, or explain.

## Scope

Add `WorkflowManagementReadPort.renderWorkflowPluginManagementAuditDetail` as a read-only control-plane projection.

The runtime consumes the current workflow/plugin evidence chain: draft intent, sandbox result, human approval, dry-run registry admission, execution isolation, publication disabled gate, and management disabled view. It renders a machine-readable audit detail for `ADMIN_WORKFLOW_PLUGIN_AUDIT_DETAIL`. It does not append command logs, persist registry data, enable UI actions, publish workflows/plugins, expose a marketplace entry, create execution candidates, launch processes, write to the host, or change the production hot path.

## Contracts

- Only internal service or admin principals with `ADMIN_SYSTEM` may render workflow/plugin management audit details.
- Students, remote channels, and ordinary teacher reviewers cannot render the management audit detail projection.
- All seven source reports must be `READY`.
- The source management view must be `WORKFLOW_PLUGIN_MANAGEMENT_VIEW_DISABLED`.
- The audit detail must contain exactly seven evidence stages: `DRAFT_INTENT`, `SANDBOX_RESULT`, `HUMAN_APPROVAL`, `REGISTRY_ADMISSION`, `EXECUTION_ISOLATION`, `PUBLICATION_DISABLED`, and `MANAGEMENT_DISABLED_VIEW`.
- The audit detail must carry exactly four disabled control actions: `publish`, `enableLocalExecution`, `createExecutionCandidate`, and `exposeMarketplace`.
- The boundary must keep `readOnly=true`, `workflowPublishAllowed=false`, `pluginMarketplaceExposureAllowed=false`, `executionCandidateAllowed=false`, `localExecutionEnabled=false`, `processLaunchAllowed=false`, `hostWriteAllowed=false`, `productionHotPathChanged=false`, and `requiresFutureSdd=true`.

## Acceptance Criteria

- Runtime tests cover normal read-only detail rendering, unauthorized principal rejection, enabled action rejection, marketplace exposure rejection, execution candidate exposure rejection, and missing report rejection.
- Audit locks the read-only detail contract, full evidence-chain dependency, no side-effect/no enabled-control runtime boundary, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-management-audit-detail.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-management-audit-detail`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice is a read-only control-plane projection over existing JSON evidence. It does not change runtime request handlers, database write paths, queue behavior, or production hot-path latency. It should not trigger a production10k rerun. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the management audit detail runtime, tests, audit, schema/example, npm script, quality-gate entry, root workflow report check, structure verifier entries, generated report, and this SDD. Existing workflow/plugin draft, sandbox, approval, registry, execution-isolation, publication-disabled, and management-disabled evidence remains unchanged and still does not enable workflow/plugin publication or host execution.
