# SDD 0253 - Research Deep Research Student Delivery Runtime

## Problem

`ResearchAgent.deep_research` now records a human student visibility review for a
teacher delivery package. The next boundary is to create a student app renderable
delivery envelope from that reviewed ticket.

This step must not be confused with durable persistence. A student-visible
envelope may be returned to the approved student app flow, but writing the main
database, writing a student archive, publishing globally, calling external
models, controlling local tools, or starting Swarm would cross a different risk
boundary.

## Scope

Add a `deep_research` student delivery runtime.

This slice:

- consumes only a
  `research_deep_research_student_visibility_review_runtime` output with
  `STUDENT_VISIBILITY_REVIEW_APPROVED_NOT_DELIVERED`
- requires the controlled delivery service principal with
  `RESEARCH_READ`, `STUDENT_DELIVERY_ENVELOPE`, and `STUDENT_APP_DELIVERY`
- records through
  `DeepResearchStudentDeliveryPort.recordStudentDeliveryEnvelope`
- creates an
  `EVIDENCE_GROUNDED_STUDENT_DELIVERY_ENVELOPE`
- marks the returned envelope as
  `STUDENT_VISIBLE_DELIVERY_ENVELOPE_NOT_PERSISTED`
- preserves claims, citations, source hashes, limitations, risk, audience scope,
  review record ID, review ID, package ID, and evidence refs
- uses an append-only command log and idempotency key for safe replay
- blocks direct publication, direct database access, main database writes,
  student archive writes, external model calls, local tool mutation, remote
  device control, and Swarm
- sets `studentDeliveryPersisted=false` and
  `requiresFuturePersistenceReview=true`

This is not durable student archive persistence. It is the approved renderable
student delivery envelope that a later persistence runtime may consume.

## Contracts

- Input schema:
  `contracts/agent/deep-research-student-delivery.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-student-delivery.output.schema.json`
- Examples:
  `contracts/agent/deep-research-student-delivery.input.example.json` and
  `contracts/agent/deep-research-student-delivery.output.example.json`
- Runtime:
  `tools/research-deep-research-student-delivery-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-student-delivery-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-student-delivery-audit.mjs`
- Audit tests:
  `tools/research-deep-research-student-delivery-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-student-delivery.jsonl`.

## Acceptance Criteria

- `node --test tools/research-deep-research-student-delivery-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-student-delivery-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-student-delivery` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchStudentDelivery`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research student delivery audit`.
- The architecture board states that `deep_research` has a student delivery
  runtime at 9.3/10 while durable student archive persistence, main database
  writes, true multi-model fusion, and final archive publishing remain future
  reviewed slices.

## Rollback

Remove the student delivery schemas, examples, runtime, tests, audit, audit
tests, report, command log output, `package.json` audit script, strict quality
entry, root workflow coverage requirement, structure-verifier entries, and
architecture board text. Keep SDD 0242 through SDD 0252 intact because intent
admission, worker lifecycle, retrieval planning, retrieval execution, reasoning
synthesis, final-answer review, finalization, render preview, publication
precheck, teacher delivery, and student visibility review remain valid without
student delivery.
