# SDD 0230: Workflow Plugin Human Approval Runtime

## Problem

The immutable root requirements require generated workflows/plugins to be automatically tested and then reviewed by humans for performance and effect before they can move toward saving. Draft intent and sandbox result runtimes now record the machine-side evidence, but the human performance/effect review still needs its own command boundary so approval cannot be faked by a registry save call or hidden inside generated code.

## Scope

Add `WorkflowApprovalCommandPort.recordWorkflowPluginHumanApproval` as an append-only human review evidence runtime.

The runtime consumes a generated workflow/plugin draft, a passing sandbox result, and a human approval artifact. It records whether the review is approved or sent back for revision. It does not save registry entries, publish workflows/plugins, expose execution candidates, or execute generated code on the host.

## Contracts

- Only non-student human reviewers with `HARNESS_APPROVE` or `ADMIN_SYSTEM` may record approval.
- Service principals, students, and remote channels cannot record human approval.
- The approval must reference the same draft, sandbox run, and reviewer principal.
- Drafts must remain `DRAFT`, `DRY_RUN_ONLY`, `sandboxRequired=true`, `humanApprovalRequired=true`, `allowedHostAccess=NONE`, and `registrySaveAllowed=false`.
- Sandbox runs must be `PASS`, prove `executedInSandbox=true`, `noHostWrite=true`, `networkPolicy=DEFAULT_DENY`, and contain only passing tests.
- Approval must have `performanceReviewed=true`, `effectReviewed=true`, and a consistent registry-save decision.
- Approved reviews return `HUMAN_APPROVED_REGISTRY_ADMISSION_READY`.
- Rejected or revision-requested reviews return `HUMAN_REVIEW_REVISION_REQUIRED`.

## Acceptance Criteria

- Runtime tests cover approved review recording, revision-requested review recording, missing Harness permission, service principal rejection, failed sandbox rejection, missing performance/effect review, and idempotency replay.
- Audit locks approval schema requirements, human reviewer authorization, required evidence, sandbox safety, append-only behavior, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-human-approval.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-human-approval`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice records human review evidence only. It should not reopen broad production pressure testing. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the human approval runtime, tests, audit, npm script, quality-gate entry, root workflow report check, structure verifier entries, generated report, and this SDD. Existing human approval command-log records remain append-only review evidence and do not publish workflows/plugins.
