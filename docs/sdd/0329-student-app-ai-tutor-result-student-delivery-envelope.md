# SDD 0329: Student App AI Tutor Result Student Delivery Envelope

## Problem

SDD 0328 proves that a teacher/admin approved an AI Tutor result for future student delivery, and SDD 0325 still holds the safe guidance sections. The next boundary must produce a Student App renderable delivery envelope without starting durable archive persistence or reopening raw model output, prompts, answer keys, `contentRef`, result refs, OCR/RAG chunks, or internal errors.

Without this boundary, the system has student-visibility approval but no auditable, learner-facing render contract.

## Scope

Add a runtime evidence slice:

- runtime: `recordStudentAppAITutorResultStudentDeliveryEnvelope`
- command port: `StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope`
- report: `reports/student-app-ai-tutor-result-student-delivery-envelope.current.json`

The runtime must:

- require a READY 0328 student-visibility review report
- require a READY 0325 controlled answer artifact report
- recompute the safe guidance sections hash from 0325 and require it to match the 0328 `guidanceSectionsHash`
- require a service principal with `STUDENT_DELIVERY_RUNTIME`, `TEACHING_READ`, `STUDENT_DELIVERY_ENVELOPE`, and `STUDENT_APP_DELIVERY`
- call only an injected student delivery envelope port
- create a renderable Student App AI Tutor result envelope for the approved student scope
- pass safe guidance text to the delivery port while keeping raw `resultRefHash`, raw model output, prompts, answer keys, `contentRef`, OCR/RAG chunks, direct DB fields, and internal errors out of student output
- support idempotent replay and reject conflicting envelopes
- keep durable archive persistence, direct database writes, HTTP execution, model inference, retrieval, tools, and Swarm disabled

## Non-Goals

This slice must not persist a student archive row, write the main database directly from JS, run model inference, start OCR/RAG retrieval, call HTTP, mutate local tools, run Swarm, generate question-bank drafts, perform AI grading, or claim complete AI Tutor product delivery.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-student-visibility-review.current.json` and `reports/student-app-ai-tutor-controlled-answer-artifact.current.json`.
- The injected delivery port receives the approved visibility metadata, safe guidance sections, student scope, evidence refs, and idempotency key.
- Runtime output records `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED`.
- The envelope delivery state is `READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED`.
- Future durable archive persistence remains a separate reviewed runtime.

## Acceptance Criteria

- Runtime tests prove positive envelope creation, idempotent replay, conflicting replay rejection, missing port rejection, unsafe service principal rejection, non-ready source rejection, unapproved visibility rejection, guidance hash mismatch rejection, unsafe policy rejection, delivery mismatch rejection, leaked field rejection, unsafe student text rejection, unsafe port result rejection, and missing evidence rejection.
- Audit verifies 0328 readiness, 0325 guidance hash match, runtime identity/idempotency, safety boundaries, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

The runtime performs in-process validation, one recomputed SHA-256 guidance hash, one input hash, one injected command-port call, and one JSONL append in the audit probe. It is a render-envelope control-plane slice and should stay below the 50ms pass target. The current whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime/audit/test files, SDD 0329, report file, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0320-0328 and the student-visibility review boundary intact.
