# SDD 0350: Student App AI Tutor Result Archive Follow-up Worker Continuity

## Problem

SDD 0349 proves that a student-visible `AI_TUTOR_RESULT_ARCHIVE` learning
action can create another queued AI Tutor request through the existing Student
App endpoint. The queue item is useful only if the internal worker path can
claim it and rebuild worker-safe input from the follow-up archive item without
falling back to the published study-packet branch or leaking raw archive/model
state.

## Scope

This slice consumes READY SDD 0349
`STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_QUEUE_ADMISSION_VERIFIED`
evidence and verifies continuity into the existing worker-safe
`AI_TUTOR_RESULT_ARCHIVE` input and model-precheck chain.

- Workload type:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_WORKER_CONTINUITY`
- Runtime evidence id:
  `student_app_ai_tutor_result_archive_follow_up_worker_continuity`
- Report:
  `reports/student-app-ai-tutor-result-archive-follow-up-worker-continuity.current.json`
- Ready status:
  `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_WORKER_CONTINUITY_VERIFIED`

## Contracts

1. Require READY 0349 follow-up queue-admission evidence.
2. Reuse the existing internal worker claim runtime and the existing
   worker-only study-packet-input endpoint.
3. Preserve the persisted `AI_TUTOR_RESULT_ARCHIVE` source type from queue
   admission into worker routing.
4. For result-archive sources, rebuild the archive item, result archive
   snapshot, safe result archive card, `SAFE_TEXT_BLOCKS` render envelope, and
   result-archive learning actions before worker input is returned.
5. Prove the worker input path is not tied to the first archived result sample;
   follow-up archive item ids must be read through the same `GetByID` and
   `GetStudentAppAITutorResultArchiveSnapshot` ports.
6. Keep the next model execution boundary as precheck-only.

## Safety Invariants

- No new public endpoint is introduced.
- Student-facing request responses still do not expose `learningActionSource`
  internals.
- Worker surfaces may expose source/status needed for routing, but not
  `contentRef`, raw result refs, raw model output, prompts, answer keys,
  rendered HTML/Markdown, or internal errors.
- The result-archive worker branch must not read published previews.
- JavaScript evidence does not directly access DB, execute SQL/HTTP, call a
  model, start OCR/RAG, invoke tools, or start Swarm.
- The slice verifies continuity only; answer generation and publication remain
  behind reviewed downstream gates.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-result-archive-follow-up-worker-continuity-audit.mjs`
  returns READY.
- Go usecase tests cover a follow-up result archive item id through the
  worker-safe result-archive input path.
- Root workflow, structure verifier, strict quality gate, root trace, and
  architecture board all track 0350.
- Existing full-system production10k evidence remains the performance basis;
  this slice does not change the runtime hot path or justify another heavy
  benchmark by itself.

## Rollback

Remove this SDD, the 0350 audit/test/report, the Go follow-up worker input
regression test, and the 0350 hook entries from package scripts, quality gate,
root workflow coverage, structure verification, root trace, and architecture
board. The earlier 0349 queue-admission boundary remains intact.
