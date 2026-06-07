# SDD 0248 - Research Deep Research Finalization Runtime

## Problem

`ResearchAgent.deep_research` now has an approved final-answer review gate. The
root research workflow still needs a separate finalization boundary so a
reviewed draft can become a stable, auditable artifact without being silently
published, written into the main database, or treated as model-generated final
content.

The unsafe shortcut is to let the review record double as publication or as a
durable user-facing answer. This slice adds a finalization runtime that records
a reviewed, not-published artifact envelope and keeps publication as a future
reviewed boundary.

## Scope

Add a `deep_research` finalization runtime.

This slice:

- accepts only a `research_deep_research_final_answer_review_runtime` output
  with `FINAL_ANSWER_REVIEW_APPROVED_FOR_FINALIZATION`
- requires `approvedForFutureFinalization=true`,
  `requiresFutureFinalizationRuntime=true`, and no final answer publication
- records through
  `DeepResearchFinalizationPort.recordDeepResearchFinalization`
- creates a finalized artifact envelope that preserves review, citation-count,
  source-hash-count, and evidence references
- uses an append-only command log and idempotency key for safe replay
- blocks answer-body injection, direct publication, direct database access,
  main database writes, student archive writes, external model calls, local
  tool mutation, remote device control, and Swarm
- sets `requiresFuturePublicationReview=true` so publication remains a separate
  reviewed runtime

This is not final-answer publication and not a main-database write. It produces
a stable finalization artifact envelope for later rendering or publication
review, under a separate approved SDD.

## Contracts

- Input schema:
  `contracts/agent/deep-research-finalization.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-finalization.output.schema.json`
- Examples:
  `contracts/agent/deep-research-finalization.input.example.json`
  and `contracts/agent/deep-research-finalization.output.example.json`
- Runtime:
  `tools/research-deep-research-finalization-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-finalization-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-finalization-audit.mjs`
- Audit tests:
  `tools/research-deep-research-finalization-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-finalization.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-finalization-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-finalization-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-finalization` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchFinalization`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research finalization audit`.
- The architecture board states that `deep_research` has a finalization runtime
  while publication, user-facing rendering, true multi-model fusion, and student
  archive writes remain future reviewed slices.

## Rollback

Remove the finalization schemas, examples, runtime, tests, audit, audit tests,
report, command log output, `package.json` audit script, strict quality entry,
root workflow coverage requirement, structure-verifier entries, and architecture
board text. Keep SDD 0242 through SDD 0247 intact because intent admission,
worker lifecycle, retrieval planning, retrieval execution, reasoning synthesis,
and final-answer review remain valid without finalization.
