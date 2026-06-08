# SDD 0326: Student App AI Tutor Answer Review Gate

## Problem

SDD 0325 records a controlled AI Tutor answer artifact that is sanitized and not student-visible. The next boundary must prove that a human reviewer approved or rejected that artifact before any tutoring result persistence work starts.

Without a separate review gate, future result persistence could accidentally treat a generated artifact as final student-facing guidance.

## Scope

Add a runtime evidence slice:

- runtime: `recordStudentAppAITutorAnswerReviewGate`
- command port: `StudentAppAITutorAnswerReviewGatePort.recordAnswerReviewGate`
- report: `reports/student-app-ai-tutor-answer-review-gate.current.json`

The runtime must:

- require a READY 0325 controlled answer artifact report
- require a teacher/admin reviewer with `TEACHING_READ + TEACHING_WRITE` or `ADMIN_SYSTEM`
- verify the review decision references the same artifact, request, worker, precheck, queue, and guidance section hash
- record only review metadata through an injected port and local JSONL command log
- support idempotent replay and reject conflicting review attempts
- keep tutoring result persistence and student visibility disabled

## Non-Goals

This slice must not persist `teaching_tutoring_analysis_requests.result*`, publish student-visible answers, call databases, call HTTP, run tools, run Swarm, run model inference, expose raw model output, expose prompts, expose `contentRef`, expose OCR/RAG chunks, expose answer keys, or claim final AI Tutor completion.

## Contracts

- Input consumes `reports/student-app-ai-tutor-controlled-answer-artifact.current.json`.
- The injected command port receives ids, review decision, reviewer id, guidance section hash, checklist metadata, and evidence refs.
- The injected command port must not receive guidance section text.
- Output includes review id, artifact id, request id, precheck id, queue ref, reviewer id, decision, guidance section hash, review state, and boundary flags.

## Acceptance Criteria

- Runtime tests prove positive review recording, idempotent replay, conflicting replay rejection, missing port rejection, unsafe reviewer rejection, unsafe source report rejection, leaked field rejection, unsafe port result rejection, and blocked persistence/visibility flags.
- Audit verifies 0325 readiness, runtime identity/idempotency, safety boundaries, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

The runtime performs in-process validation, one SHA-256 hash over sanitized guidance metadata, one injected command-port call, and one JSONL append in the audit probe. This is a control-plane review boundary and should stay under the 50ms target. The current whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime/audit/test files, SDD 0326, report file, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0320-0325 and existing AI Tutor source/input/precheck/artifact boundaries intact.
