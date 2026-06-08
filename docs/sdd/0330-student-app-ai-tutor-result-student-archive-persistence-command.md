# SDD 0330: Student App AI Tutor Result Student Archive Persistence Command

## Problem

SDD 0329 creates a Student App renderable AI Tutor result envelope, but it intentionally stops before durable student archive persistence. The next boundary must record an append-only archive persistence command that preserves the safe guidance evidence and student scope while keeping the durable database commit behind a later reviewed runtime.

Without this boundary, the system would either stop at student rendering or jump directly from a render envelope to archive writes without a separate persistence command review point.

## Scope

Add a runtime evidence slice:

- runtime: `recordStudentAppAITutorResultStudentArchivePersistenceCommand`
- command port: `StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand`
- report: `reports/student-app-ai-tutor-result-student-archive-persistence-command.current.json`

The runtime must:

- require a READY 0329 student delivery envelope report
- require a READY 0325 controlled answer artifact report
- recompute the safe guidance sections hash from 0325 and require it to match the 0329 envelope
- require a service principal with `STUDENT_ARCHIVE_PERSISTENCE_RUNTIME`, `TEACHING_READ`, `STUDENT_ARCHIVE_WRITE`, and `STUDENT_APP_DELIVERY`
- require a student-scoped append-only persistence request that matches the 0329 delivery envelope
- record `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`
- preserve only safe guidance sections, summary, safety labels, delivery metadata, and evidence refs
- support idempotent replay and reject conflicting commands
- keep durable archive commit, direct database writes, HTTP execution, model inference, retrieval, tools, and Swarm disabled

## Non-Goals

This slice must not write a student archive row, commit a database transaction, expose HTTP, run model inference, start OCR/RAG retrieval, mutate local tools, run Swarm, generate question-bank drafts, perform AI grading, or claim complete AI Tutor product delivery.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-student-delivery-envelope.current.json` and `reports/student-app-ai-tutor-controlled-answer-artifact.current.json`.
- Runtime output records `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`.
- Command kind is `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_COMMAND`.
- Command commit state is `NOT_COMMITTED_TO_STUDENT_ARCHIVE`.
- Future durable archive storage commit remains a separate reviewed runtime.

## Acceptance Criteria

- Runtime tests prove positive command recording, idempotent replay, conflicting replay rejection, unsafe service principal rejection, non-ready delivery rejection, guidance hash mismatch rejection, unsafe policy rejection, delivery mismatch rejection, leaked field rejection, and unsafe guidance text rejection.
- Audit verifies 0329 readiness, 0325 guidance hash match, runtime identity/idempotency, no durable commit, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

The runtime performs in-process validation, one recomputed SHA-256 guidance hash, one input hash, and one append-only JSONL command write in the audit probe. It is a control-plane persistence-command slice and should stay below the 50ms pass target. The current whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime/audit/test files, SDD 0330, report file, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0320-0329 and the student delivery envelope boundary intact.
