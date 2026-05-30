# SDD 0072: Workflow Plugin Contract Flow Gate

## Problem

The root requirements say Workflow and Plugin mode must not become a manual
Coze-like builder. Users describe a workflow or plugin need, AI generates code,
the system runs tests, reports failures, lets a human evaluate performance and
effect, and only then saves the artifact into a workflow/plugin pool.

The refactor has Agent Harness approval and rollback safety in place, but P6
Workflow And Plugins still lacks a contract-shaped gate. Without a locked draft
to sandbox to approval to registry contract, later generated-code work could
accidentally skip sandbox tests, save unapproved artifacts, or treat plugins as
ordinary editor extensions rather than self-evolution tools.

## Source Requirement References

- Root requirement: workflows are generated from natural-language process
  descriptions, automatically tested, improved from failures, and saved only
  after human evaluation.
- Root requirement: plugins are AI-generated self-evolution components,
  including task-failure learning, MCP/Skill-like capabilities, and script
  support.
- Whole-system module map: P6 Workflow And Plugins first evidence slice is the
  workflow draft/test/save contract.
- Agent Harness flow: generated local actions must remain review-only until a
  later SDD explicitly enables execution.

## Scope

In scope:

- Add JSON contracts for workflow/plugin drafts, sandbox runs, human approval,
  and registry entries.
- Require workflow and plugin drafts to be generated artifacts, not manual node
  graphs.
- Require plugin drafts to support both user-requested and task-failure-learning
  origins.
- Require generated artifacts to be sandboxed before approval.
- Require human approval to include performance and effect review before
  registry save.
- Keep execution dry-run/review-only in this slice.
- Add an executable audit gate and focused tests.
- Include the audit in the strict quality gate.

Out of scope:

- Calling models to generate code.
- Executing generated workflow/plugin code.
- Building a Workflow/Plugin UI.
- Adding model, training, OCR, RAG, or sandbox runtime dependencies.
- Persisting registry entries in a database.

## Contracts

Schemas:

- `contracts/workflow/workflow-plugin-draft.schema.json`
- `contracts/workflow/workflow-plugin-sandbox-run.schema.json`
- `contracts/workflow/workflow-plugin-approval.schema.json`
- `contracts/workflow/workflow-plugin-registry-entry.schema.json`

Examples:

- `contracts/workflow/workflow-draft.example.json`
- `contracts/workflow/plugin-draft.example.json`
- `contracts/workflow/workflow-plugin-sandbox-run.example.json`
- `contracts/workflow/workflow-plugin-approval.example.json`
- `contracts/workflow/workflow-plugin-registry-entry.example.json`

Audit:

- `tools/workflow-plugin-flow-audit.mjs`
- `tools/workflow-plugin-flow-audit.test.mjs`
- `reports/workflow-plugin-flow.current.json`

## Acceptance Criteria

- `node --test tools/workflow-plugin-flow-audit.test.mjs` fails before the
  audit exists.
- Workflow/plugin draft contracts require generated artifacts, sandbox
  requirement, human approval requirement, and dry-run execution mode.
- Plugin draft contracts include task-failure-learning origin.
- Sandbox result contracts require sandbox execution, no host writes, and
  default-deny network policy.
- Approval contracts require performance and effect review.
- Registry contracts require sandbox and approval references plus rollback.
- `npm run audit:workflow-plugin-flow` passes.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Remove the workflow/plugin contracts, examples, audit tool, audit tests, current
audit report, quality-gate command entry, package audit script, and this SDD.
Agent Harness and existing module contracts remain unchanged.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused workflow/plugin audit test result after implementation.
- `npm run audit:workflow-plugin-flow` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
