# SDD 0074: Workflow Plugin Revision Feedback

## Problem

SDD 0072 and SDD 0073 now define generated workflow/plugin draft contracts,
sandbox evidence, human approval, and registry admission. The root requirement
also says failed generated workflow/plugin attempts must report errors, feed
back to optimization, and only save after the improved artifact passes tests and
human evaluation.

The current P6 path can block save, but it does not yet produce a stable
revision request that captures sandbox failures or human revision requests for
the next generation attempt. Without that feedback boundary, generated-code
work could fail silently, lose test evidence, or retry without preserving why
the previous attempt was rejected.

## Source Requirement References

- Root requirement: generated workflows are automatically tested, failures are
  fed back, and the result is improved before human evaluation and save.
- Root requirement: generated plugins follow the same process and can learn from
  task failures as self-evolution components.
- SDD 0072: sandbox runs and human approval are contract-shaped P6 evidence.
- SDD 0073: registry admission blocks failed or unapproved artifacts.

## Scope

In scope:

- Add a workflow/plugin revision request contract.
- Generate a revision request from failed sandbox evidence.
- Generate a revision request from human `REVISION_REQUESTED` approval.
- Require revision requests to block registry save.
- Preserve the source draft ID and source evidence IDs.
- Include machine-readable issues and recommended actions.
- Add a focused audit command using current examples with an intentionally
  failed sandbox copy.
- Include the audit in the strict quality gate.

Out of scope:

- Calling an AI model to produce the revised code.
- Executing generated code.
- Building a UI for revisions.
- Persisting revisions in a database.
- Enabling local execution.
- Adding model, training, OCR, RAG, or sandbox runtime dependencies.

## Contracts

Schema:

- `contracts/workflow/workflow-plugin-revision-request.schema.json`

Example:

- `contracts/workflow/workflow-plugin-revision-request.example.json`

Tooling:

- `tools/workflow-plugin-revision-feedback.mjs`
- `tools/workflow-plugin-revision-feedback.test.mjs`
- `reports/workflow-plugin-revision-feedback.current.json`

## Acceptance Criteria

- `node --test tools/workflow-plugin-revision-feedback.test.mjs` fails before
  the feedback tool exists.
- Failed sandbox evidence creates `REVISION_REQUIRED`.
- Human `REVISION_REQUESTED` approval creates `REVISION_REQUIRED`.
- Passing sandbox plus approved save creates no revision request.
- Human `REJECTED` approval does not create a revision request.
- Revision requests always set `saveBlocked=true`.
- Revision requests preserve draft ID, source kind, source evidence ID, issues,
  and recommended actions.
- `npm run audit:workflow-plugin-revision` passes.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Remove the revision request contract, example, feedback tool, focused tests,
current report, package audit script, quality-gate entry, and this SDD. Existing
workflow/plugin contract and registry admission gates remain unchanged.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused revision feedback test result after implementation.
- `npm run audit:workflow-plugin-revision` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
