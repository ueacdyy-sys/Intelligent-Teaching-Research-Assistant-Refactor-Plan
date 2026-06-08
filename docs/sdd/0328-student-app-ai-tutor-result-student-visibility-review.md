# SDD 0328: Student App AI Tutor Result Student Visibility Review

## Problem

SDD 0327 proves that an approved AI Tutor result can be persisted through the existing tutoring-analysis result boundary, but that persisted result is still not safe to expose to students. The next boundary must record a human student-visibility review that approves only a future delivery runtime.

Without this boundary, the system would jump from internal result persistence to student delivery without a separate learner-safety review record.

## Scope

Add a runtime evidence slice:

- runtime: `recordStudentAppAITutorResultStudentVisibilityReview`
- command port: `StudentAppAITutorResultStudentVisibilityReviewPort.recordResultStudentVisibilityReview`
- report: `reports/student-app-ai-tutor-result-student-visibility-review.current.json`

The runtime must:

- require a READY 0327 reviewed-result persistence bridge report
- require a TEACHER or ADMIN reviewer with the right scopes
- require `APPROVE_FOR_STUDENT_DELIVERY_RUNTIME`
- require checklist evidence that raw model output, prompts, answer keys, `contentRef`, result refs, and guidance text are not exposed
- call only an injected student-visibility review port
- support idempotent replay and reject conflicting reviews
- record approval for a future student-delivery runtime only
- keep actual student publication, delivery envelopes, and durable archive persistence disabled

## Non-Goals

This slice must not publish tutoring guidance to students, create a delivery envelope, persist student archive rows, run model inference, start OCR/RAG retrieval, call HTTP, call databases directly from JS, run local tools, run Swarm, or claim complete AI Tutor product delivery.

## Contracts

- Input consumes `reports/student-app-ai-tutor-reviewed-result-persistence-bridge.current.json`.
- The injected port receives reviewed metadata and `guidanceSectionsHash`, not guidance text or raw result references.
- Runtime output records `AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED`.
- Future student delivery and future archive persistence remain separate runtimes.

## Acceptance Criteria

- Runtime tests prove positive review, idempotent replay, conflicting replay rejection, missing port rejection, unsafe reviewer rejection, non-ready source rejection, non-approved decision rejection, unsafe policy rejection, leaked field rejection, unsafe review note rejection, unsafe port result rejection, and missing evidence rejection.
- Audit verifies 0327 readiness, runtime identity/idempotency, safety boundaries, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

The runtime performs in-process validation, one SHA-256 input hash, one injected command-port call, and one JSONL append in the audit probe. It is a control-plane review record and should stay below the 50ms pass target. The current whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime/audit/test files, SDD 0328, report file, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0320-0327 and the reviewed-result persistence bridge intact.
