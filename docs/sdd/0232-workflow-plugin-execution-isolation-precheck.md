# SDD 0232: Workflow Plugin Execution Isolation Precheck

## Problem

The immutable root requirements allow the system to evolve generated workflows/plugins after automatic tests and human performance/effect review. SDD 0231 can persist approved entries into a dry-run registry, but the next architectural risk is accidental promotion from "registered" to "executable." The refactor needs a runtime precheck that records why execution candidates are still blocked, without enabling local host execution.

## Scope

Add `WorkflowExecutionIsolationCommandPort.recordWorkflowPluginExecutionIsolationPrecheck` as a conservative execution-candidate isolation precheck.

The runtime consumes a dry-run registry entry, a deny-by-default execution isolation policy, and the current empty execution-candidate view. It writes append-only command evidence proving that the registry entry is not allowed to become an execution candidate. It does not publish workflows/plugins, expose execution candidates, launch processes, write to the host, or execute generated code.

## Contracts

- Only internal service or admin principals with `ADMIN_SYSTEM` may record execution isolation prechecks.
- Students, remote channels, and ordinary teacher reviewers cannot record execution isolation prechecks.
- Registry entries must be `ACTIVE`, `executionMode=DRY_RUN_ONLY`, and `localExecutionEnabled=false`.
- Isolation policy must keep `mode=BLOCK_HOST_EXECUTION`, `hostWritePolicy=DENY`, `networkPolicy=DEFAULT_DENY`, `processLaunchAllowed=false`, `candidateExposure=DISABLED`, `requiresFutureSdd=true`, and `auditLogRequired=true`.
- Execution candidate view must keep `candidateCount=0`, `candidates=[]`, and `blockedReason="real local execution is disabled by current SDD"`.
- Blocked preconditions must include `future SDD must explicitly enable execution candidates`.
- Evidence must include registry admission, human approval, sandbox result, SharedContext, GuardrailResult, RouteDecision, input hash, output summary, rollback plan, audit trace, and idempotency key.
- Idempotency replay returns the existing command result and does not append another command-log record.

## Acceptance Criteria

- Runtime tests cover blocked execution-candidate precheck, executable registry rejection, unsafe process-launch policy rejection, exposed candidate rejection, unauthorized principal rejection, and idempotency replay.
- Audit locks deny-by-default policy, empty candidate-view contract, internal admin writer authorization, dry-run registry policy, append-only/no-execution behavior, quality gate registration, root workflow coverage, and structure verification.
- Root workflow coverage requires `reports/workflow-plugin-execution-isolation.current.json` for `workflow_plugin_self_evolution`.
- `npm run audit:workflow-plugin-execution-isolation`, focused Node tests, `npm run verify:structure`, `npm run audit:root-workflow-coverage`, and `npm run quality` pass.

## Performance Note

This slice writes small append-only control-plane evidence and does not change the production hot path. It should not reopen broad production pressure testing. Current whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this supports the 10k RPS / 50ms class but not a 10ms production claim.

## Rollback

Remove the execution isolation runtime, tests, audit, policy schema/example, npm script, quality-gate entry, root workflow report check, structure verifier entries, generated report, and this SDD. Existing command-log records remain append-only blocking evidence and do not enable workflow/plugin publishing or host execution.
