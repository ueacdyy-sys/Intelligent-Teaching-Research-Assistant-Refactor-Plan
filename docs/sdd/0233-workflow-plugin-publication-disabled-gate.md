# SDD 0233: Workflow Plugin Publication Disabled Gate

## Problem

The immutable root requirements allow workflows/plugins to evolve through automatic tests, human performance/effect review, and controlled registry admission. SDD 0232 blocks execution candidates, but a dry-run registry entry could still be misread as something that is ready for marketplace exposure or real publication. The refactor needs an explicit publication gate that records publication is disabled until a future SDD introduces executable isolation, signing, rollout, and rollback.

## Scope

Add `WorkflowPublicationCommandPort.recordWorkflowPluginPublicationDisabledPrecheck` as a publication-disabled runtime boundary.

The runtime consumes a dry-run registry entry, the execution-isolation result, and a deny-by-default publication policy. It writes append-only command evidence proving the workflow/plugin remains internal dry-run catalog evidence only. It does not publish workflows/plugins, expose a plugin marketplace entry, expose execution candidates, launch processes, write to the host, or execute generated code.

## Contracts

- Only internal service or admin principals with `ADMIN_SYSTEM` may record publication disabled prechecks.
- Students, remote channels, and ordinary teacher reviewers cannot record publication disabled prechecks.
- Registry entries must be `ACTIVE`, `executionMode=DRY_RUN_ONLY`, and `localExecutionEnabled=false`.
- Execution isolation result must be `EXECUTION_CANDIDATE_BLOCKED_BY_ISOLATION` and must keep `candidateCount=0`, `executionCandidateAllowed=false`, `workflowPublishAllowed=false`, `localExecutionEnabled=false`, `processLaunchAllowed=false`, `hostWriteAllowed=false`, and `requiresFutureSdd=true`.
- Publication policy must keep `mode=BLOCK_PUBLICATION`, `publicationAllowed=false`, `publicationChannel=DISABLED`, `registryExposure=INTERNAL_DRY_RUN_CATALOG_ONLY`, `requiresExecutionIsolation=true`, `requiresFutureSdd=true`, and `auditLogRequired=true`.
- Evidence must include registry admission, execution isolation, human approval, sandbox result, SharedContext, GuardrailResult, RouteDecision, input hash, output summary, rollback plan, audit trace, and idempotency key.
- Idempotency replay returns the existing command result and does not append another command-log record.

## Acceptance Criteria

- Runtime tests cover blocked publication precheck, publish-allowed policy rejection, exposed execution-candidate rejection, executable registry rejection, unauthorized principal rejection, and idempotency replay.
- Audit locks deny-by-default publication policy, internal admin writer authorization, dry-run registry enforcement, blocked execution-isolation dependency, append-only/no-publish/no-execution behavior, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-publication-disabled.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-publication-disabled`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice writes small append-only control-plane evidence and does not change the production hot path. It should not reopen broad production pressure testing. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the publication disabled runtime, tests, audit, policy schema/example, npm script, quality-gate entry, root workflow report check, structure verifier entries, generated report, and this SDD. Existing command-log records remain append-only blocking evidence and do not enable workflow/plugin publishing, marketplace exposure, or host execution.
