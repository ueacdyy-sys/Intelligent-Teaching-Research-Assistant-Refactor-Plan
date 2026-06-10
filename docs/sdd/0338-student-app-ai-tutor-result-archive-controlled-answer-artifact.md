# SDD 0338: Student App AI Tutor Result Archive Controlled Answer Artifact

## Problem

SDD 0337 proves that a Student App AI Tutor request sourced from
`AI_TUTOR_RESULT_ARCHIVE` can enter the queue-only model execution precheck.
The next boundary is the review-only controlled answer artifact.

Without this slice, follow-up tutoring from a reviewed AI Tutor result archive
can reach model precheck but remains unproven at the sanitized answer artifact
boundary. That would leave the result-archive follow-up path unable to reuse the
same human-review and persistence chain as the published study-packet path.

## Scope

Extend the existing shared controlled answer artifact runtime evidence so it is
source-aware:

- `PUBLISHED_STUDY_PACKET` keeps consuming SDD 0324.
- `AI_TUTOR_RESULT_ARCHIVE` consumes SDD 0337.

This slice records:

- workload:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT`
- wrapper runtime id:
  `student_app_ai_tutor_result_archive_controlled_answer_artifact`
- shared runtime:
  `student_app_ai_tutor_controlled_answer_artifact_runtime`
- command port:
  `StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact`
- status:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RECORDED`
- report:
  `reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json`

The shared runtime still records a review-only controlled answer artifact. It
does not publish a student-visible result.

## Non-Goals

This slice does not run actual model inference, construct prompts, persist a
tutoring result, publish student-visible content, call OCR/RAG, use external
tools, start Swarm orchestration, execute HTTP, or access a database directly.
It also does not replace the SDD 0325 published study-packet controlled answer
artifact path.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-result-archive-model-execution-precheck.current.json`.
- Source report 0337 must be `READY`,
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK`, zero-error,
  and `AI_TUTOR_RESULT_ARCHIVE`.
- The shared controlled answer runtime must verify the 0337 wrapper runtime,
  the shared model precheck runtime, source result archive flags, and
  `READY_FOR_STUDENT_APP_READ`.
- The injected command port receives ids, model route, input hash, artifact
  policy, attempt id, and evidence refs only.
- Output records `learningActionSource=AI_TUTOR_RESULT_ARCHIVE` and
  `resultArchiveStatus=READY_FOR_STUDENT_APP_READ`.
- Output keeps `reviewState=PENDING_HUMAN_REVIEW`.
- Output excludes prompt text, raw model output, answer keys, raw result refs,
  direct DB fields, internal errors, and student-visible publication fields.

## Acceptance Criteria

- Runtime tests prove a result-archive-sourced controlled answer artifact can be
  recorded for human review only.
- Runtime tests reject unsafe result-archive source reports.
- Audit proves source 0337 readiness, shared runtime source awareness, runtime
  probe, negative test coverage, quality gate hook, root workflow coverage hook,
  structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

This is a control-plane artifact boundary. It validates one READY 0337 report,
calls one injected command port, and appends one JSONL evidence record. Runtime
SLO target remains P99 under 50ms.

Current whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. This slice does not repeat production10k because it
does not change the current Docker/WSL multi-worker load path or production
runtime configuration.

## Rollback

Remove SDD 0338, the result-archive controlled answer artifact audit/test/report,
package script, quality-gate entry, root workflow coverage hook, structure
verifier entry, root trace row, and architecture-board note. Keep SDD 0325 and
SDD 0337 intact so the published answer artifact and result-archive model
precheck boundaries remain valid.
