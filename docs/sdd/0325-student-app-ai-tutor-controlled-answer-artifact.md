# SDD 0325: Student App AI Tutor Controlled Answer Artifact

## Problem

SDD 0324 proves that a worker-safe AI Tutor input can enter a queue-only model execution precheck. The next unsafe boundary is generated answer handling: the system must not mix raw model output, final tutoring result persistence, student-visible delivery, and review in one step.

Before future `RecordTutoringAnalysisResult` work, the system needs a controlled answer artifact that is linked to the 0324 precheck, sanitized for review, and still not visible to students.

## Scope

Add a runtime evidence slice:

- runtime: `recordStudentAppAITutorControlledAnswerArtifact`
- command port: `StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact`
- report: `reports/student-app-ai-tutor-controlled-answer-artifact.current.json`

The runtime must:

- require a READY 0324 AI Tutor model execution precheck report
- require `SERVICE + AGENT_INTERNAL + TEACHING_WRITE + AGENT_COMMAND_SUBMIT`
- require a generation attempt tied to the same `precheckId`, `queueRef`, `requestId`, and `workerId`
- record through an injected port and local JSONL command log
- support idempotent replay and reject conflicting replay attempts
- accept only a sanitized controlled answer artifact for review
- keep tutoring result persistence and student visibility disabled

## Non-Goals

This slice must not persist `teaching_tutoring_analysis_requests.result*`, publish student-visible answers, expose raw model output, expose prompts, expose `contentRef`, expose OCR/RAG chunks, expose answer keys, call HTTP, call databases, run tools, run Swarm, or claim final AI Tutor completion.

## Contracts

- Input consumes `reports/student-app-ai-tutor-model-execution-precheck.current.json`.
- The injected command port receives ids, model route, input hash, policy metadata, attempt id, and evidence refs.
- Output includes a controlled artifact id, request id, worker id, precheck id, queue ref, sanitized guidance sections, safety labels, and review state.
- Output excludes prompt text, raw model output, answer keys, result refs, direct DB fields, internal errors, and student-visible publication fields.

## Acceptance Criteria

- Runtime tests prove positive artifact recording, idempotent replay, conflicting replay rejection, missing port rejection, unsafe principal rejection, bad source precheck rejection, leaked raw/model fields rejection, unsafe port result rejection, and disabled persistence/visibility flags.
- Audit verifies SDD 0324 readiness, runtime identity/idempotency, safety boundaries, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

The runtime performs in-process validation, one SHA-256 hash, one injected command-port call, and one JSONL append in the audit probe. This is a control-plane artifact boundary and should stay under the 50ms target. The current whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime/audit/test files, SDD 0325, report file, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0320-0324 and existing worker claim/input/precheck endpoints intact.
