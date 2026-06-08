# SDD 0327: Student App AI Tutor Reviewed Result Persistence Bridge

## Problem

SDD 0326 proves that a teacher/admin approved the controlled AI Tutor answer artifact, but no tutoring result is persisted yet. The next boundary must connect that approved review gate to the existing `RecordTutoringAnalysisResult` use case without reopening raw model output, guidance text, direct database writes, or student-visible delivery.

Without this bridge, the system has a safe review gate but no auditable path from reviewed answer metadata into the durable tutoring-result state machine.

## Scope

Add a runtime evidence slice:

- runtime: `recordStudentAppAITutorReviewedResultPersistenceBridge`
- command port: `StudentAppAITutorResultPort.recordTutoringAnalysisResult`
- report: `reports/student-app-ai-tutor-reviewed-result-persistence-bridge.current.json`

The runtime must:

- require a READY 0326 answer review gate report
- require `APPROVE_FOR_RESULT_PERSISTENCE`
- reuse the existing `RecordTutoringAnalysisResult.Execute` boundary
- call only an injected `StudentAppAITutorResultPort.recordTutoringAnalysisResult`
- pass review id, artifact id, request id, archive item id, worker id, section hash, result status, and evidence refs
- avoid sending guidance section text, raw model output, prompts, answer keys, `contentRef`, OCR/RAG chunks, direct DB fields, or internal errors to the port
- support idempotent replay and reject conflicting persistence commands
- keep student-visible delivery disabled

## Non-Goals

This slice must not publish the AI Tutor answer to students, generate question-bank drafts, run model inference, start OCR/RAG retrieval, call HTTP, call databases directly from JS, run local tools, run Swarm, or claim complete AI Tutor product delivery.

## Contracts

- Input consumes `reports/student-app-ai-tutor-answer-review-gate.current.json`.
- The injected result port receives only reviewed metadata and an opaque internal result reference.
- Runtime output stores only `resultRefHash`, not the raw result reference.
- Existing Go evidence remains the authoritative persistence boundary: `RecordTutoringAnalysisResult.Execute`, domain normalization/authorization, and guarded PostgreSQL update with worker lease checks.

## Acceptance Criteria

- Runtime tests prove positive persistence, idempotent replay, conflicting replay rejection, missing port rejection, unsafe service principal rejection, non-ready source rejection, rejected review rejection, unsafe policy rejection, leaked field rejection, unsafe port result rejection, result-ref mismatch rejection, and missing evidence rejection.
- Audit verifies 0326 readiness, existing Go result boundary reuse, runtime identity/idempotency, safety boundaries, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

The runtime performs in-process validation, one SHA-256 input hash, one injected command-port call, and one JSONL append in the audit probe. It is a control-plane bridge and should stay below the 50ms pass target. The current whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime/audit/test files, SDD 0327, report file, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0320-0326 and the existing `RecordTutoringAnalysisResult` boundary intact.
