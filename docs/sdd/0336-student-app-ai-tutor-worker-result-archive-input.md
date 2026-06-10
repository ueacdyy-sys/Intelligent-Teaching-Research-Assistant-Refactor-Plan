# SDD 0336: Student App AI Tutor Worker Result Archive Input

## Problem

SDD 0335 lets a student create a follow-up AI Tutor request from a reviewed
AI Tutor result archive. The worker-only input endpoint still needed a second
safe source path: when the queued request came from `AI_TUTOR_RESULT_ARCHIVE`,
the worker must rebuild the archived result card, render envelope, and learning
actions instead of reading the old published study-packet preview.

Without this slice, a persisted request source can be lost after a database
round trip, and the worker may fall back to `PUBLISHED_STUDY_PACKET`. That would
make result-archive follow-up requests either fail late or accidentally read an
unrelated published-preview boundary.

## Scope

Extend the existing worker-only endpoint:

`POST /v1/teaching/tutoring-analysis-requests/{requestId}/ai-tutor-study-packet-input`

The endpoint and use case must branch by persisted queue source:

- `PUBLISHED_STUDY_PACKET`: preserve the SDD 0323 study-packet path.
- `AI_TUTOR_RESULT_ARCHIVE`: rebuild the safe result archive card, render
  envelope, and learning actions, then return worker-safe `SAFE_TEXT_BLOCKS`.

The slice covers:

- `teaching_tutoring_analysis_requests.source_type`
- `TutoringAnalysisRequest.LearningActionSource`
- `ReadAITutorWorkerStudyPacketInput.readResultArchiveInput`
- `BuildAITutorWorkerResultArchiveInput`
- internal worker HTTP/OpenAPI response fields
- static audit report
  `reports/student-app-ai-tutor-worker-result-archive-input.current.json`

## Non-Goals

This slice does not run model inference, construct prompts, call OCR/RAG,
perform Swarm orchestration, create question-bank drafts, publish content, or
change student-facing AI Tutor request responses. It only proves the internal
worker input boundary can safely consume a result-archive-sourced request.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-result-student-archive-learning-actions.current.json`.
- The queue source is persisted in `source_type`; empty legacy rows default to
  `PUBLISHED_STUDY_PACKET`.
- Student-facing `TutoringAnalysisRequestResponse` must not expose
  `learningActionSource`.
- Internal worker claim and worker input responses expose
  `learningActionSource`.
- `AI_TUTOR_RESULT_ARCHIVE` worker input returns
  `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
- `renderFormat` is always `SAFE_TEXT_BLOCKS`.
- Result archive worker blocks may be `SUMMARY` and `GUIDANCE_SECTION` and may
  include `sourceBlockRefs`.
- The result archive branch must not call
  `GetPublishedForStudentApp` or `GetPublishedContentPreviewForStudentApp`.
- Responses must omit raw render blocks, `contentRef`, `contentPreview`,
  raw content, raw result refs, raw model output, prompts, RAG chunks, answer
  keys, rendered HTML, rendered Markdown, and student-facing internals.

## Acceptance Criteria

- Go domain tests prove `BuildAITutorWorkerResultArchiveInput` consumes only a
  READY safe render envelope and returns worker-safe blocks.
- Go use-case tests prove result-archive requests use `GetByID`,
  `GetStudentAppAITutorResultArchiveSnapshot`,
  `BuildStudentAppAITutorResultArchiveRenderEnvelope`, and do not read
  published-preview sources.
- HTTP tests prove the worker endpoint returns `AI_TUTOR_RESULT_ARCHIVE`,
  `READY_FOR_STUDENT_APP_READ`, `SUMMARY`, `GUIDANCE_SECTION`, and
  `sourceBlockRefs` without leaked raw/internal fields.
- PostgreSQL tests and scanners prove `source_type` is inserted, selected, and
  defaulted safely.
- OpenAPI exposes source/status only on internal worker surfaces.
- Audit verifies SDD 0335 readiness, persisted source fields, branch logic,
  HTTP/OpenAPI leak boundaries, package/quality/root/structure hooks, root trace
  and architecture-board tracking.

## Performance Note

This is a control-plane worker-input boundary. It performs request lookup, lease
validation, result archive safe snapshot read, safe card/render/action rebuild,
and response mapping. The target remains P99 under 50ms. Current whole-system
evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this
slice does not repeat production10k load testing because it does not change the
current load/config path.

## Rollback

Remove SDD 0336, the worker result-archive input audit/test/report, package
script, quality-gate entry, root workflow coverage hook, structure verifier
entry, root trace row, architecture-board note, OpenAPI worker additions, HTTP
result-archive worker-input test, `source_type` persistence changes, and
result-archive worker branch. Keep SDD 0323 and SDD 0335 intact if their reports
remain valid.
