# SDD 0228: Workflow Plugin Draft Command Intent Runtime

## Problem

The immutable root requirements define workflow and plugin generation as natural-language-to-generated-code, automatic testing, human performance/effect review, optimization, and only then saving into the workflow/plugin pool. The existing workflow/plugin slice has contracts, sandbox evidence, registry admission, revision feedback, and dry-run SLO checks, but `draft_workflow_plugin` still needs a concrete command-intent runtime boundary.

## Scope

Add `WorkflowDraftCommandPort.submitWorkflowPluginDraftIntent` as a review-only runtime slice in the refactor workspace.

The runtime accepts a generated workflow/plugin draft and appends an idempotent command-log record for Harness review. It does not execute generated code, does not publish a workflow, does not save a registry entry, does not expose execution candidates, and does not write business tables.

## Contracts

- Input requires principal context, generated draft, SharedContext, GuardrailResult, RouteDecision, input hash, output summary, approval artifact, rollback plan, audit trace, and idempotency key.
- Principal must have `AGENT_COMMAND_SUBMIT` or `ADMIN_SYSTEM`.
- Student principals are rejected.
- Remote channel submissions require `requiresHarnessApproval=true`.
- Drafts must stay `DRAFT`, `DRY_RUN_ONLY`, `sandboxRequired=true`, `humanApprovalRequired=true`, `allowedHostAccess=NONE`, and `registrySaveAllowed=false`.
- Output returns `REVIEW_REQUIRED` and `AGENT_WRITE_INTENT_REVIEW_REQUIRED`.
- Command log is append-only JSONL evidence under `reports/workflow-command-log/`.

## Acceptance Criteria

- Runtime tests cover successful append, missing evidence rejection, student rejection, idempotent replay, and unsafe registry-save rejection.
- Audit locks gateway allowlist, draft contract safety, runtime authorization/evidence checks, append-only behavior, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-draft-intent.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-draft-intent`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice adds a controlled write-intent runtime boundary, not a new throughput claim. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the runtime, runtime tests, audit, audit tests, npm script, quality-gate entry, root workflow coverage report check, structure verifier entries, generated report, and this SDD. Existing command-log records remain review artifacts because they do not publish workflows/plugins or create execution candidates.
