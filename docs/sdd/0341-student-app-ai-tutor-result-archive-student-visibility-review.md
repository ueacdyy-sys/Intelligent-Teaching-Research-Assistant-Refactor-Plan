# SDD 0341: Student App AI Tutor Result Archive Student Visibility Review

## Problem

SDD 0340 proves that a human-reviewed `AI_TUTOR_RESULT_ARCHIVE` follow-up result can enter the existing reviewed-result persistence bridge. That still must not make the result visible to students automatically.

Without this slice, result-archive follow-up tutoring would jump from controlled persistence to future delivery without a separate learner-safety visibility review.

## Root Requirement Trace

- 学生端：学生可以从 AI Tutor 历史结果继续学习，但学生可见内容必须受控。
- AI辅导助手：历史结果追问必须经过生成预检、受控答案、人审、持久化和学生可见性审查。
- 学生档案：结果归档来源必须保留 `AI_TUTOR_RESULT_ARCHIVE` 和 `READY_FOR_STUDENT_APP_READ` 证据。
- Agent Harness：审查只能通过注入端口记录，不允许 JS runtime 直连数据库、HTTP、工具、OCR/RAG 或 Swarm。

## Scope

This slice consumes READY SDD 0340 evidence and records a result-archive student visibility review through the shared SDD 0328 runtime.

- wrapper runtime id: `student_app_ai_tutor_result_archive_student_visibility_review`
- shared runtime id: `student_app_ai_tutor_result_student_visibility_review_runtime`
- command port: `StudentAppAITutorResultStudentVisibilityReviewPort.recordResultStudentVisibilityReview`
- source runtime: `student_app_ai_tutor_result_archive_reviewed_result_persistence_bridge`
- report: `reports/student-app-ai-tutor-result-archive-student-visibility-review.current.json`

## Behavior

1. Accept only READY 0340 result-archive reviewed-result persistence evidence.
2. Require the shared reviewed-result persistence runtime and wrapper source metadata to agree.
3. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
4. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
5. Require TEACHER or ADMIN review approval for a future student-delivery runtime.
6. Call only the injected student visibility review port.
7. Preserve request, archive item, review, artifact, guidance hash, idempotency, source, and evidence refs.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.current.json`.
- The source report must be `READY`, zero-error, `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_REVIEWED_RESULT_PERSISTENCE_BRIDGE`, and `AI_TUTOR_RESULT_ARCHIVE`.
- The shared student visibility review runtime must accept both the original 0327 reviewed-result persistence report and the 0340 result-archive wrapper report.
- The injected visibility review port receives source metadata, ids, guidance hash, checklist, decision, and evidence refs only.
- Output keeps `studentVisiblePublished=false`; student delivery remains a separate reviewed slice.

## Non-Goals

This slice must not publish guidance to students, create a delivery envelope, persist student archive rows, run model inference, start OCR/RAG retrieval, call HTTP, call databases directly from JS, run local tools, run Swarm, or claim complete AI Tutor product delivery.

## Safety Boundaries

- No guidance text sent to the port.
- No raw result reference, raw model output, prompt, answer key, `contentRef`, OCR/RAG chunks, or internal error leakage.
- No student-visible publication.
- No delivery envelope creation.
- No direct database, HTTP, tool, local mutation, retrieval, or Swarm execution.
- Idempotent replay is accepted only when the input hash matches.

## TDD Coverage

- Positive shared runtime test for result-archive-sourced student visibility review.
- Negative shared runtime test for unsafe result-archive source metadata.
- Audit test for missing 0340 source evidence.
- Audit test for runtime not being result-archive source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove that 0340 result-archive reviewed persistence can be consumed by the same student visibility review boundary without publishing.
- Audit proves 0340 readiness, source-aware shared runtime behavior, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a load-path configuration.

## Performance Evidence

This is a JS control-plane probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0341, the result-archive student visibility review audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0328 and SDD 0340 intact so the shared student visibility review runtime and result-archive persistence bridge remain valid.
