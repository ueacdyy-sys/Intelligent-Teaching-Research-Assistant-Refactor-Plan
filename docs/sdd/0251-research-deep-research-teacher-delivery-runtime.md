# SDD 0251 - Research Deep Research Teacher Delivery Runtime

## Problem

`ResearchAgent.deep_research` now records a publication precheck, but the
teacher still needs a bounded delivery package in the research workspace. The
system needs a concrete handoff artifact that a teacher can read, copy, or use
inside the desktop research mode without pretending that the result has been
published to students or persisted as a durable final answer.

Without this boundary, a UI could either stop at a review ticket that is not
usable, or accidentally treat publication precheck approval as student-visible
delivery.

## Scope

Add a `deep_research` teacher delivery runtime.

This slice:

- consumes only an approved
  `research_deep_research_publication_precheck_runtime` output with
  `PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED`
- also verifies the matching
  `research_deep_research_render_preview_runtime` output with
  `RENDER_PREVIEW_READY_NOT_PUBLISHED`
- requires a human research teacher or admin
- records through
  `DeepResearchTeacherDeliveryPort.recordTeacherDeliveryPackage`
- creates an `EVIDENCE_GROUNDED_TEACHER_DELIVERY_PACKAGE`
- preserves claims, citations, source hashes, limitations, risk, preview ID,
  finalization artifact ID, precheck ID, and evidence references
- uses an append-only command log and idempotency key for safe replay
- blocks direct publication, student-visible delivery, direct database access,
  main database writes, student archive writes, external model calls, local
  tool mutation, remote device control, and Swarm
- sets `requiresFutureStudentDeliveryReview=true` and
  `requiresFuturePersistenceReview=true`

This is not student delivery, not public publication, and not durable
persistence. It is a teacher-workspace package derived from already reviewed
deep research evidence.

## Contracts

- Input schema:
  `contracts/agent/deep-research-teacher-delivery.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-teacher-delivery.output.schema.json`
- Examples:
  `contracts/agent/deep-research-teacher-delivery.input.example.json`
  and `contracts/agent/deep-research-teacher-delivery.output.example.json`
- Runtime:
  `tools/research-deep-research-teacher-delivery-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-teacher-delivery-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-teacher-delivery-audit.mjs`
- Audit tests:
  `tools/research-deep-research-teacher-delivery-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-teacher-delivery.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-teacher-delivery-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-teacher-delivery-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-teacher-delivery` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchTeacherDelivery`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research teacher delivery audit`.
- The architecture board states that `deep_research` has a teacher delivery
  runtime while student-visible delivery, durable persistence, true multi-model
  fusion, and student archive writes remain future reviewed slices.

## Rollback

Remove the teacher delivery schemas, examples, runtime, tests, audit, audit
tests, report, command log output, `package.json` audit script, strict quality
entry, root workflow coverage requirement, structure-verifier entries, and
architecture board text. Keep SDD 0242 through SDD 0250 intact because intent
admission, worker lifecycle, retrieval planning, retrieval execution, reasoning
synthesis, final-answer review, finalization, render preview, and publication
precheck remain valid without teacher delivery.
