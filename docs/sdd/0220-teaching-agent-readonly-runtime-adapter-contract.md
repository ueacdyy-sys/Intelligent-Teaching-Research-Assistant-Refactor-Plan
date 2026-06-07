# SDD 0220: TeachingAgent Read-Only Runtime Adapter Contract

## Problem

SDD 0219 made `search_teaching_material` a checked read-only Skill with
concrete input and output schemas. That still leaves one risky gap before any
runtime Agent code is added: a future adapter could call the database directly,
reuse a write repository, request student archives, or skip timing evidence
while still appearing to satisfy the Skill schema at the boundary.

The root requirements make Teaching Mode a core product workflow, but they also
require safe local control, privacy boundaries, and evidence-based execution.
The next slice therefore needs a runtime adapter contract before implementing
the Agent loop.

## Scope

In scope:

- Add a TeachingAgent read-only adapter schema and example.
- Bind `TeachingAgent` and `search_teaching_material` to a single-worker fast
  path.
- Require the adapter to call `TeachingArchiveReadPort.searchTeachingMaterials`.
- Forbid direct database access, write operations, student archive access,
  external model calls, and local tool mutation.
- Require principal context, SharedContext, GuardrailResult, invocation trace,
  input hash, output summary, source evidence, and runtime timing evidence.
- Keep the adapter in `CONTRACT_ONLY` evidence class until live runtime SLO
  evidence exists.

Out of scope:

- Implementing the runtime Agent loop.
- Re-running broad performance matrices.
- Adding RAG, OCR, vector stores, external model calls, or training dependencies
  to the baseline.
- Allowing TeachingAgent to save quiz drafts, write student records, or publish
  workflows.

## Contracts

- `contracts/agent/teaching-agent-readonly-adapter.schema.json` defines the
  adapter boundary.
- `contracts/agent/teaching-agent-readonly-adapter.example.json` demonstrates
  the current safe fast-path configuration.
- `tools/agent-skill-contract-audit.mjs` checks the adapter identity, read port,
  guards, data scopes, evidence requirements, SLO budget, and promotion rules.
- `tools/verify-structure.mjs` requires both adapter contract files.

The adapter is constrained to:

- `workerAgent=TeachingAgent`;
- `skillId=search_teaching_material`;
- `routeMode=SINGLE_WORKER`;
- `readPort=TeachingArchiveReadPort.searchTeachingMaterials`;
- `directDatabaseAccessAllowed=false`;
- `writeOperationAllowed=false`;
- `knowledge=PUBLIC`, `student=NONE`, `teaching=READ`,
  `research=NONE`, `localTool=NONE`;
- `p99BudgetMs<=50`;
- `currentEvidenceClass=CONTRACT_ONLY`;
- `runtimeEvidenceRequiredBeforePromotion=true`.

## Acceptance Criteria

- Focused tests pass for the current TeachingAgent read-only adapter contract.
- The audit fails if the adapter can bypass the read port or access the
  database directly.
- The audit fails if the adapter can request student archives, local tool
  mutation, or wider data scopes.
- The audit fails if runtime timing evidence or promotion evidence can be
  skipped.
- `npm run audit:agent-skill-contracts` reports `READY`.
- `npm run verify:structure` requires the new adapter schema and example.

## Rollback

Remove `contracts/agent/teaching-agent-readonly-adapter.schema.json` and
`contracts/agent/teaching-agent-readonly-adapter.example.json`, remove the
adapter checks from `tools/agent-skill-contract-audit.mjs`, remove the focused
tests from `tools/agent-skill-contract-audit.test.mjs`, remove the files from
`tools/verify-structure.mjs`, regenerate `reports/agent-skill-contracts.current.json`,
and delete this SDD. SDD 0219 remains as the Skill input/output contract, but
runtime implementation must stay blocked until another adapter boundary is
defined.

## Observability And Performance Evidence

This slice does not change the current production10k performance claim. It adds
runtime boundary evidence only. The adapter remains `CONTRACT_ONLY` until a
future slice implements the runtime path and produces live evidence showing the
TeachingAgent read-only Skill respects the 50ms budget under root workflow
coverage and strict quality gates.
