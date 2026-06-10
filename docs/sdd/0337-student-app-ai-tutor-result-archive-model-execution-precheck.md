# SDD 0337: Student App AI Tutor Result Archive Model Execution Precheck

## Problem

SDD 0336 proves that a queued Student App AI Tutor request sourced from
`AI_TUTOR_RESULT_ARCHIVE` can rebuild worker-safe result archive input. The
existing SDD 0324 model execution precheck was originally proven only for the
`PUBLISHED_STUDY_PACKET` source.

Without this slice, a follow-up tutoring request from a reviewed AI Tutor result
archive can reach the worker input boundary but remains unproven at the
queue-only model execution precheck gate. That would leave the result-archive
follow-up path stalled before any controlled answer artifact can be created.

## Scope

Extend the shared Student App AI Tutor model execution precheck runtime so it is
source-aware:

- `PUBLISHED_STUDY_PACKET` keeps using the SDD 0323 worker study-packet input.
- `AI_TUTOR_RESULT_ARCHIVE` consumes the SDD 0336 worker result-archive input.

This slice records:

- workload:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK`
- runtime id:
  `student_app_ai_tutor_result_archive_model_execution_precheck`
- shared runtime:
  `student_app_ai_tutor_model_execution_precheck_runtime`
- command port:
  `StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck`
- status:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECKED`
- report:
  `reports/student-app-ai-tutor-result-archive-model-execution-precheck.current.json`

The runtime still only admits a queue-only model execution precheck. It does not
build a prompt and does not call a model.

## Non-Goals

This slice does not run actual model inference, construct prompts, generate AI
Tutor answer text, create a controlled answer artifact, persist a tutoring
result, publish student-visible content, call OCR/RAG, use external tools, start
Swarm orchestration, execute HTTP, or access a database directly.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-worker-result-archive-input.current.json`.
- Source report 0336 must be `READY`,
  `STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT`, and zero-error.
- `workerInput.learningActionSource` must be `AI_TUTOR_RESULT_ARCHIVE`.
- `workerInput.resultArchiveStatus` must be `READY_FOR_STUDENT_APP_READ`.
- `workerInput.packetStatus` must be absent for result-archive sources.
- `renderFormat` must be `SAFE_TEXT_BLOCKS`.
- Result archive blocks may only use `SUMMARY` and `GUIDANCE_SECTION`.
- The runtime hashes safe block content and `sourceBlockRefs` into the input
  hash.
- The injected command port receives only source, render format, block count,
  block digests, input hash, approval, and evidence metadata.
- The injected command port must not receive safe guidance text or
  `sourceBlockRefs`.
- Output records `learningActionSource`, `resultArchiveStatus`,
  `sourceWorkerInputVerified`, `sourceWorkerResultArchiveInputVerified`, and
  queue-only boundary flags.
- Evidence refs must include `worker-result-archive-input` and
  `model-execution-approval`.

## Acceptance Criteria

- Runtime tests prove a result-archive-sourced model precheck records queue-only
  admission without sending guidance text or source block refs to the port.
- Runtime tests reject mismatched source evidence and leaked fields.
- Audit proves source 0336 is READY, the shared runtime accepts
  `AI_TUTOR_RESULT_ARCHIVE`, the port sees no safe text or source refs, and
  P99 remains below 50ms.
- Package scripts and strict quality gate include the 0337 audit.
- Root workflow coverage tracks 0337 after
  `student_app_ai_tutor_worker_result_archive_input` in both
  `teaching_archive_quiz_and_ai_grading` and
  `student_app_personalized_learning`.
- Structure verification requires the SDD, audit, test, and runtime evidence id.
- Root requirements trace and architecture board describe the 0337 boundary and
  its non-goals.

## Performance Note

This is a control-plane precheck boundary. It validates one READY 0336 report,
hashes worker-safe `SAFE_TEXT_BLOCKS`, calls one injected command port, and
appends one JSONL evidence record. Runtime SLO target remains P99 under 50ms.

Current whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. This slice does not repeat production10k because it
does not change the current Docker/WSL multi-worker load path or production
runtime configuration.

## Rollback

Remove SDD 0337, the result-archive model execution precheck audit/test/report,
package script, quality-gate entry, root workflow coverage hook, structure
verifier entry, root trace row, and architecture-board note. Keep SDD 0324 and
SDD 0336 intact so the published model precheck and result-archive worker input
boundaries remain valid.
