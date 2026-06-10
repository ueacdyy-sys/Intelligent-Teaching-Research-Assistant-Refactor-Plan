# SDD 0340: Student App AI Tutor Result Archive Reviewed Result Persistence Bridge

## Problem

SDD 0339 proves that a Student App AI Tutor follow-up request sourced from `AI_TUTOR_RESULT_ARCHIVE` has passed the human answer review gate. The next boundary is controlled persistence of the reviewed result.

Without this slice, historical-result follow-up tutoring can be reviewed but cannot prove that the reviewed metadata entered the durable tutoring-result state machine through the same guarded path used by the normal AI Tutor flow.

## Root Requirement Trace

- 学生端：学生可以从自己的 AI Tutor 历史结果继续学习。
- AI辅导助手：历史结果追问必须经过受控生成、人审和结果持久化边界。
- 学生档案：持久化结果仍不等于学生可见发布，学生可见必须由后续切片审查。
- Agent Harness：写入必须通过注入端口、证据、权限和幂等边界，不允许 JS runtime 直连数据库。

## Scope

This slice consumes READY SDD 0339 `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE_RECORDED` evidence and records a result-archive reviewed result persistence bridge.

It deliberately reuses the shared SDD 0327 runtime instead of creating a duplicate write path:

- wrapper runtime id: `student_app_ai_tutor_result_archive_reviewed_result_persistence_bridge`
- shared runtime id: `student_app_ai_tutor_reviewed_result_persistence_bridge_runtime`
- command port: `StudentAppAITutorResultPort.recordTutoringAnalysisResult`
- target use case: `RecordTutoringAnalysisResult.Execute`
- report: `reports/student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.current.json`

## Behavior

1. Accept only READY 0339 result-archive answer review gate evidence.
2. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
3. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
4. Require `APPROVE_FOR_RESULT_PERSISTENCE`.
5. Call only the injected `StudentAppAITutorResultPort.recordTutoringAnalysisResult`.
6. Preserve review id, artifact id, request id, archive item id, worker id, source metadata, section hash, evidence refs, and idempotency key.
7. Store only hashed/opaque result references in the runtime evidence.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-answer-review-gate.current.json`.
- The source report must be `READY`, zero-error, `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE`, and `AI_TUTOR_RESULT_ARCHIVE`.
- The shared persistence bridge runtime must accept both the original 0326 answer review gate report and the 0339 result-archive wrapper report.
- The injected result port receives reviewed metadata, source type, result archive status, hashes, ids, and evidence refs only.
- Output keeps `studentVisiblePublished=false`; student delivery remains a separate reviewed slice.

## Non-Goals

This slice must not publish the result to students, create delivery envelopes, create question-bank drafts, run model inference, run OCR/RAG retrieval, call HTTP, call databases directly from JS, run local tools, run Swarm, or claim complete AI Tutor product delivery.

## Safety Boundaries

- No guidance text sent to the result port.
- No raw model output, prompt, answer key, `contentRef`, raw result reference, OCR/RAG chunks, or internal error leakage.
- No student-visible publication.
- No direct database access in JS runtime.
- No HTTP execution.
- No external tools or local mutation.
- No retrieval or Swarm.
- Idempotent replay must be accepted only when the input hash matches.

## TDD Coverage

- Positive shared runtime test for result-archive-sourced reviewed result persistence.
- Negative shared runtime test for unsafe result-archive source metadata.
- Audit test for missing 0339 source evidence.
- Audit test for runtime not being result-archive source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove that a 0339 result-archive answer review gate can be persisted through `RecordTutoringAnalysisResult.Execute` without guidance text, raw model data, or student visibility.
- Audit proves 0339 readiness, existing Go result boundary reuse, source-aware shared runtime behavior, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a load-path configuration.

## Performance Evidence

This is a JS control-plane probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0340, the result-archive reviewed result persistence bridge audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0327 and SDD 0339 intact so the shared persistence bridge and result-archive answer review gate remain valid.
