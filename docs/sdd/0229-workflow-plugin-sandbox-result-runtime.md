# SDD 0229: Workflow Plugin Sandbox Result Runtime

## Problem

The immutable root requirements say workflow/plugin artifacts must be generated, automatically tested, report errors, then wait for human performance/effect review before saving. The refactor already has draft intent recording and sandbox result contracts, but the sandbox result itself still needs a runtime boundary that records evidence and converts failures into revision feedback without publishing generated code.

## Scope

Add `WorkflowSandboxCommandPort.recordWorkflowPluginSandboxRunResult` as a review-only runtime slice.

The runtime records trusted sandbox result evidence for an existing generated workflow/plugin draft. It does not run generated code itself, does not write to the host, does not save registry entries, does not publish workflows/plugins, and does not expose execution candidates.

## Contracts

- Only internal service or admin principals may record sandbox results.
- Sandbox result input must reference the draft intent record, sandbox manifest, SharedContext, GuardrailResult, RouteDecision, input hash, output summary, rollback plan, audit trace, and idempotency key.
- Drafts must remain `DRAFT`, `DRY_RUN_ONLY`, `sandboxRequired=true`, `humanApprovalRequired=true`, `allowedHostAccess=NONE`, and `registrySaveAllowed=false`.
- Sandbox runs must prove `executedInSandbox=true`, `noHostWrite=true`, `networkPolicy=DEFAULT_DENY`, non-empty tests, and a performance summary.
- Passing sandbox runs return `SANDBOX_PASSED_REVIEW_REQUIRED`.
- Failing sandbox runs return `SANDBOX_FAILED_REVISION_REQUIRED` and include a blocking revision request.

## Acceptance Criteria

- Runtime tests cover passing result recording, failing result revision feedback, non-service rejection, host-write rejection, and idempotency replay.
- Audit locks sandbox contract safety, runtime authorization/evidence checks, append-only behavior, revision feedback, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-sandbox-result.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-sandbox-result`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice records sandbox evidence only. It should not reopen broad production pressure testing. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the sandbox result runtime, tests, audit, npm script, quality-gate entry, root workflow report check, structure verifier entries, generated report, and this SDD. Existing sandbox result command-log records remain append-only review evidence and do not publish workflows/plugins.
