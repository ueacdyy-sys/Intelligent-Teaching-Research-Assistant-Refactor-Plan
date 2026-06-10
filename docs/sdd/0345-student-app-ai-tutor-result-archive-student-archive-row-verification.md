# SDD 0345: Student App AI Tutor Result Archive Student Archive Row Verification

## Problem

SDD 0344 commits safe `AI_TUTOR_RESULT_ARCHIVE` guidance through the Teaching Archive use case port, but it still needs physical row verification before later Student App read slices can trust the archive item as durable evidence.

Without this slice, the result-archive branch has a persisted outcome claim but no audited `ArchiveRepository.GetByID` row-read proof for the committed Teaching Archive item.

## Root Requirement Trace

- 学生端：学生基于历史 AI Tutor 结果继续学习后，归档结果需要可验证地进入学生档案。
- AI辅导助手：结果归档来源必须继续保留 `AI_TUTOR_RESULT_ARCHIVE` 与 `READY_FOR_STUDENT_APP_READ`。
- 学生档案：本切片只验证物理行，不开放新的学生端读取接口。
- Agent Harness：运行时只允许通过注入 Teaching Archive row read port 验证，不允许 JS 直连数据库、HTTP、模型、OCR/RAG、工具或 Swarm。

## Scope

This slice consumes READY SDD 0344 evidence, then verifies the committed Teaching Archive item through the shared SDD 0332 row verification runtime.

- wrapper runtime id: `student_app_ai_tutor_result_archive_student_archive_row_verification`
- shared runtime id: `student_app_ai_tutor_result_student_archive_row_verification_runtime`
- command port: `StudentAppAITutorResultStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow`
- required source runtime: `student_app_ai_tutor_result_archive_student_archive_storage_commit`
- row read source: `ArchiveRepository.GetByID`
- target table: `teaching_archive_items`
- report: `reports/student-app-ai-tutor-result-archive-student-archive-row-verification.current.json`

## Behavior

1. Accept only READY 0344 result-archive student archive storage commit evidence.
2. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
3. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
4. Invoke exactly one injected `TeachingArchiveRowReadPort.getArchiveItemById`.
5. Require row-read source `ArchiveRepository.GetByID` from `teaching_archive_items`.
6. Require the physical row to match the 0344 committed archive item.
7. Preserve source storage commit metadata, safe guidance hash, and evidence refs.
8. Record wrapper status `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED`.
9. Keep the shared runtime status as `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED`.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-student-archive-storage-commit.current.json`.
- Output records physical row evidence for `tarch_student_ai_tutor_result_001`.
- The shared 0332 runtime must continue accepting the original 0331 path and also accept the 0344 result-archive wrapper path.
- Future Student App safe read remains a separate reviewed runtime.

## Non-Goals

This slice must not expose Student App read APIs, execute SQL from JavaScript, create archive items, mutate student archive state, publish student-visible content, run models, construct prompts, start OCR/RAG retrieval, expose raw `contentRef`, run tools, or execute Swarm.

## Safety Boundaries

- Only safe guidance and metadata already committed in 0344 may be verified.
- Raw result refs, raw model output, prompts, answer keys, raw content refs, direct SQL fields, and internal errors remain blocked.
- JavaScript records evidence and calls an injected row read port; database access remains in the Go repository boundary.
- Idempotent replay is accepted only when the existing verification evidence matches the current input hash.

## TDD Coverage

- Positive shared runtime test for result-archive-sourced row verification through the injected row read port.
- Negative shared runtime test for unsafe result-archive source metadata.
- Audit test for missing 0344 readiness.
- Audit test for shared runtime not being result-archive row-verification source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.
- Go repository test for the result-archive-source `ArchiveRepository.GetByID` row shape.

## Acceptance Criteria

- Runtime tests prove 0344 can be consumed by the shared row verification runtime without losing result-archive provenance.
- Audit proves 0344 readiness, source-aware shared runtime behavior, single injected row read port invocation, exact physical row match, result-archive metadata preservation, negative test coverage, Go row-shape evidence, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a production load-path configuration.

## Performance Evidence

This is a JS control-plane row verification probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors, one injected row read port call.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0345, the result-archive student archive row verification audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, architecture-board note, and the result-archive-source Go repository row-shape test. Keep SDD 0332 and SDD 0344 intact so the shared row verification runtime and result-archive storage commit remain valid reviewed slices.
