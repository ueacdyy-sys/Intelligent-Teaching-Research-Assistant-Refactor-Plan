# SDD 0236: Workflow Plugin Management Read-Only List

## Problem

SDD 0235 renders a single workflow/plugin management audit detail, but an administrator still needs a list projection before a real product surface can be built. Without a read-only list, future UI work would either jump straight to detail pages or rebuild unsafe summary logic outside the audited evidence chain.

## Scope

Add `WorkflowManagementReadPort.renderWorkflowPluginManagementReadonlyList` as a read-only control-plane projection.

The runtime consumes one or more `WorkflowManagementReadPort.renderWorkflowPluginManagementAuditDetail` results and renders `ADMIN_WORKFLOW_PLUGIN_MANAGEMENT_LIST`. It does not query databases, append command logs, publish workflows/plugins, expose marketplace entries, create execution candidates, enable local execution, launch processes, write to the host, or change the production hot path.

## Contracts

- Only internal service or admin principals with `ADMIN_SYSTEM` may render workflow/plugin management lists.
- Students, remote channels, and ordinary teacher reviewers cannot render this list.
- The list must contain at least one audit detail result.
- Every list row must come from `WORKFLOW_PLUGIN_MANAGEMENT_AUDIT_DETAIL_READONLY` evidence.
- Every row must preserve seven evidence stages and exactly four disabled control actions: `publish`, `enableLocalExecution`, `createExecutionCandidate`, and `exposeMarketplace`.
- Duplicate registry entries are rejected so the management surface cannot show conflicting controls for the same workflow/plugin.
- The boundary must keep `readOnly=true`, `allEntriesReadOnly=true`, `allActionsDisabled=true`, `workflowPublishAllowed=false`, `pluginMarketplaceExposureAllowed=false`, `executionCandidateAllowed=false`, `localExecutionEnabled=false`, `processLaunchAllowed=false`, `hostWriteAllowed=false`, `productionHotPathChanged=false`, and `requiresFutureSdd=true`.

## Acceptance Criteria

- Runtime tests cover normal list rendering, unauthorized principal rejection, empty list rejection, enabled action rejection, execution exposure rejection, and duplicate registry entry rejection.
- Audit locks the read-only list contract, audit-detail source dependency, no side-effect/no enabled-control runtime boundary, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-management-readonly-list.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-management-readonly-list`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice is a read-only control-plane projection over existing JSON audit detail evidence. It does not change runtime request handlers, database write paths, queue behavior, worker counts, or production hot-path latency. It should not trigger a production10k rerun. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the read-only list runtime, tests, audit, schema/example, npm script, quality-gate entry, root workflow report check, structure verifier entries, generated report, and this SDD. Existing workflow/plugin draft, sandbox, approval, registry, execution-isolation, publication-disabled, management-disabled, and management-audit-detail evidence remains unchanged and still does not enable workflow/plugin publication or host execution.
