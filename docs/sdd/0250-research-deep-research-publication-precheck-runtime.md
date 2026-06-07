# SDD 0250 - Research Deep Research Publication Precheck Runtime

## Problem

`ResearchAgent.deep_research` now has a teacher-only render preview, but the
system still needs a separate publication precheck before any future delivery
runtime can expose that preview to users or students. A preview is not consent
to publish. The publication decision must remain explicit, auditable, and
blocked from direct delivery.

Without this boundary, a UI could treat `PREVIEW_READY_NOT_PUBLISHED` as a
publication candidate and skip the human review of student visibility,
limitations, evidence integrity, and publication risk.

## Scope

Add a `deep_research` publication precheck runtime.

This slice:

- consumes only a `research_deep_research_render_preview_runtime` output with
  `RENDER_PREVIEW_READY_NOT_PUBLISHED`
- requires a human research teacher or admin reviewer
- records through
  `DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck`
- allows `APPROVED_FOR_DELIVERY_RUNTIME`, `REVISION_REQUIRED`, or `REJECTED`
  decisions
- preserves preview, finalization artifact, citation-count, sourceHash-count,
  risk, comments, and evidence references
- uses an append-only command log and idempotency key for safe replay
- blocks direct publication, student-visible delivery, publication candidates,
  direct database access, main database writes, student archive writes, external
  model calls, local tool mutation, remote device control, and Swarm
- sets `requiresFutureDeliveryRuntime=true`

This is not publication, not student delivery, and not a main-database write. It
is a future-delivery approval or revision record.

## Contracts

- Input schema:
  `contracts/agent/deep-research-publication-precheck.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-publication-precheck.output.schema.json`
- Examples:
  `contracts/agent/deep-research-publication-precheck.input.example.json`
  and `contracts/agent/deep-research-publication-precheck.output.example.json`
- Runtime:
  `tools/research-deep-research-publication-precheck-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-publication-precheck-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-publication-precheck-audit.mjs`
- Audit tests:
  `tools/research-deep-research-publication-precheck-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-publication-precheck.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-publication-precheck-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-publication-precheck-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-publication-precheck` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchPublicationPrecheck`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research publication precheck audit`.
- The architecture board states that `deep_research` has a publication precheck
  runtime while actual delivery, student visibility, true multi-model fusion,
  and student archive writes remain future reviewed slices.

## Rollback

Remove the publication precheck schemas, examples, runtime, tests, audit, audit
tests, report, command log output, `package.json` audit script, strict quality
entry, root workflow coverage requirement, structure-verifier entries, and
architecture board text. Keep SDD 0242 through SDD 0249 intact because intent
admission, worker lifecycle, retrieval planning, retrieval execution, reasoning
synthesis, final-answer review, finalization, and render preview remain valid
without publication precheck.
