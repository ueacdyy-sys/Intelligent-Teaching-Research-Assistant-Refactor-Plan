# SDD 0073: Workflow Plugin Registry Admission

## Problem

SDD 0072 locked the generated workflow/plugin contract flow, but it still only
proves the shape of draft, sandbox, approval, and registry records. The root
requirements need an actual save boundary: generated workflow/plugin artifacts
may enter the workflow/plugin pool only after sandbox tests pass and a human
reviewer allows save after performance and effect evaluation.

Without a registry admission function and append-only pool store, later code
could write registry entries directly, skip sandbox evidence, ignore approval
links, or overwrite existing pool state.

## Source Requirement References

- Root requirement: workflows are saved into the workflow pool after tests,
  feedback, performance/effect evaluation, and human approval.
- Root requirement: plugins are AI-generated self-evolution components that
  follow the same generated-test-review-save flow.
- SDD 0072: generated workflow/plugin records are dry-run, sandbox-required,
  human-approval-required, and registry entries reference sandbox plus approval.
- Whole-system module map: P6 requires sandbox tests, approval tests, and
  registry tests.

## Scope

In scope:

- Add a registry admission result contract.
- Add a pure admission function from draft, sandbox run, and approval inputs.
- Build a registry entry only when all IDs match, sandbox status is `PASS`,
  sandbox host/network constraints hold, approval decision is `APPROVED`,
  registry save is allowed, and performance/effect review is complete.
- Keep registry entries `DRY_RUN_ONLY` and `localExecutionEnabled=false`.
- Add an append-only JSONL registry store with readback.
- Add focused tests for allow, block, ID mismatch, and append/read behavior.
- Add a dry-run audit command using current examples and include it in quality.

Out of scope:

- Executing generated code.
- Calling an AI model.
- Building UI for workflow/plugin pools.
- Database persistence.
- Enabling local execution.
- Adding model, training, OCR, RAG, or sandbox runtime dependencies.

## Contracts

Schema:

- `contracts/workflow/workflow-plugin-registry-admission.schema.json`

Example:

- `contracts/workflow/workflow-plugin-registry-admission.example.json`

Tooling:

- `tools/workflow-plugin-registry-admission.mjs`
- `tools/workflow-plugin-registry-admission.test.mjs`
- `reports/workflow-plugin-registry-admission.current.json`

## Acceptance Criteria

- `node --test tools/workflow-plugin-registry-admission.test.mjs` fails before
  the admission tool exists.
- Admission returns `ALLOW_SAVE` and a registry entry for the current valid
  workflow example.
- Admission blocks failed sandbox runs.
- Admission blocks approval records that do not allow registry save.
- Admission blocks mismatched draft/sandbox/approval IDs.
- JSONL registry store appends entries and reads them in order.
- Registry entries remain `DRY_RUN_ONLY` and `localExecutionEnabled=false`.
- `npm run audit:workflow-plugin-registry` passes.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Remove the registry admission contract, example, admission tool, admission
tests, current admission report, package audit script, quality-gate entry, and
this SDD. SDD 0072 contracts remain as the latest P6 boundary.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused registry admission test result after implementation.
- `npm run audit:workflow-plugin-registry` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
