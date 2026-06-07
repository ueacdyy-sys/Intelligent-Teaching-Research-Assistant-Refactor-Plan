# SDD 0249 - Research Deep Research Render Preview Runtime

## Problem

`ResearchAgent.deep_research` can now produce a reviewed finalization artifact
envelope, but that envelope intentionally does not contain a user-visible
answer body. The next safe step is not publication. The system needs a separate
teacher-only render preview boundary that combines the reviewed synthesis draft
with the finalized artifact envelope, preserves citations and source hashes,
encodes unsafe text, and still blocks student visibility and publication.

Without this boundary, future UI or publication work would be tempted to read
the synthesis draft directly, skip finalization evidence, or treat finalization
as publication. That would weaken the root safety model.

## Scope

Add a `deep_research` render preview runtime.

This slice:

- consumes a `research_deep_research_reasoning_synthesis_runtime` output and a
  `research_deep_research_finalization_runtime` output for the same job
- requires the finalization status
  `FINAL_ANSWER_FINALIZED_NOT_PUBLISHED`
- verifies claim, citation, and sourceHash counts match between synthesis and
  finalization
- records through
  `DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview`
- creates a teacher-only `SAFE_TEXT_BLOCKS` preview with unsafe text encoded
- preserves every claim's citations, sourceHashes, supportChunkIds, confidence,
  limitations, review record, and finalization artifact reference
- uses an append-only command log and idempotency key for safe replay
- blocks publication, publication candidates, student visibility, direct
  database access, main database writes, student archive writes, external model
  calls, local tool mutation, remote device control, and Swarm
- keeps `requiresFuturePublicationReview=true`

This is not final-answer publication, not a student-visible answer, and not a
main-database write. It creates a teacher-review preview for a later approved
publication boundary or for manual review.

## Contracts

- Input schema:
  `contracts/agent/deep-research-render-preview.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-render-preview.output.schema.json`
- Examples:
  `contracts/agent/deep-research-render-preview.input.example.json`
  and `contracts/agent/deep-research-render-preview.output.example.json`
- Runtime:
  `tools/research-deep-research-render-preview-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-render-preview-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-render-preview-audit.mjs`
- Audit tests:
  `tools/research-deep-research-render-preview-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-render-preview.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-render-preview-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-render-preview-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-render-preview` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchRenderPreview`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research render preview audit`.
- The architecture board states that `deep_research` has a render preview
  runtime while publication, student-visible delivery, true multi-model fusion,
  and student archive writes remain future reviewed slices.

## Rollback

Remove the render preview schemas, examples, runtime, tests, audit, audit tests,
report, command log output, `package.json` audit script, strict quality entry,
root workflow coverage requirement, structure-verifier entries, and architecture
board text. Keep SDD 0242 through SDD 0248 intact because intent admission,
worker lifecycle, retrieval planning, retrieval execution, reasoning synthesis,
final-answer review, and finalization remain valid without render preview.
