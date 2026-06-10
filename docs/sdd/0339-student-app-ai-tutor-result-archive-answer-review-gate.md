# SDD 0339: Student App AI Tutor Result Archive Answer Review Gate

## Problem

SDD 0338 proves that a Student App AI Tutor request sourced from `AI_TUTOR_RESULT_ARCHIVE` can produce a review-only controlled answer artifact. The next boundary is human review.

Without this slice, result-archive follow-up tutoring can create a sanitized answer artifact but cannot prove that a TEACHER or ADMIN reviewed it before the later persistence and student-visible delivery chain. That would leave the historical-result follow-up path weaker than the published study-packet AI Tutor path.

## Root Requirement Trace

- 学生端：学生可以从自己的 AI Tutor 历史结果继续学习。
- AI辅导助手：历史结果追问仍必须经过受控生成、人审和后续持久化边界。
- 学生档案：任何学生可见结果或档案写入都必须由后续切片显式完成。
- Agent Harness：AI 产物进入人工复核门禁，禁止绕过审批直接发布。

## Scope

This slice consumes SDD 0338 `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RECORDED` evidence and records a review-only answer gate for `AI_TUTOR_RESULT_ARCHIVE` follow-up tutoring.

It deliberately reuses the shared `student_app_ai_tutor_answer_review_gate_runtime` from SDD 0326 instead of duplicating review-gate behavior. The 0339 audit adds a source-aware wrapper:

- runtime id: `student_app_ai_tutor_result_archive_answer_review_gate`
- shared runtime id: `student_app_ai_tutor_answer_review_gate_runtime`
- command port: `StudentAppAITutorAnswerReviewGatePort.recordAnswerReviewGate`
- status: `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE_RECORDED`

## Behavior

1. Accept only READY 0338 result-archive controlled answer artifact evidence.
2. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
3. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
4. Require TEACHER or ADMIN human review.
5. Send only review metadata, hashes, ids, source type, and decision to the injected port.
6. Preserve `APPROVE_FOR_RESULT_PERSISTENCE` as approval for the next controlled persistence slice.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json`.
- Source report 0338 must be `READY`, zero-error, `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT`, and `AI_TUTOR_RESULT_ARCHIVE`.
- The shared answer review runtime must accept both the original 0325 controlled artifact report and the 0338 result-archive wrapper report.
- The injected review port receives ids, reviewer principal metadata, decision, guidance-section hash, source type, result archive status, and evidence refs only.
- Output records `learningActionSource=AI_TUTOR_RESULT_ARCHIVE` and `resultArchiveStatus=READY_FOR_STUDENT_APP_READ`.
- Output keeps `resultPersistenceStarted=false`, `tutoringResultRecorded=false`, and `studentVisiblePublished=false`.

## Safety Boundaries

- No tutoring result persistence.
- No student-visible publication.
- No raw model output.
- No prompt or answer key.
- No guidance text sent to the review port.
- No direct database access.
- No HTTP execution.
- No external tools.
- No retrieval, OCR/RAG, vector lookup, or Swarm.
- No model inference.

## TDD Coverage

- Positive runtime test for result-archive-sourced answer review gate.
- Unsafe result-archive source rejection test.
- Audit test for missing 0338 source evidence.
- Audit test for runtime not being result-archive aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, structure, root workflow, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove a result-archive-sourced answer review gate can be recorded without guidance text leakage, result persistence, or student visibility.
- Runtime tests reject unsafe result-archive controlled answer artifact reports.
- Audit proves source 0338 readiness, shared runtime source awareness, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Evidence

This is a JS control-plane probe, not a production10k load-path change.

- Target P99: 50ms.
- Current 0339 audit expectation: P99 <= 50ms, 0 errors.
- Full-system production10k evidence remains attached to the root SLO review: 22,435.1 read/write RPS, P99 44.44ms, 0 errors.

## Next Slice

Use 0339 as the result-archive human-review boundary, then add a source-aware reviewed result persistence bridge for `AI_TUTOR_RESULT_ARCHIVE` only after review approval is present.

## Rollback

Remove SDD 0339, the result-archive answer review gate audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0326 and SDD 0338 intact so the shared answer review gate and result-archive controlled answer artifact boundaries remain valid.
