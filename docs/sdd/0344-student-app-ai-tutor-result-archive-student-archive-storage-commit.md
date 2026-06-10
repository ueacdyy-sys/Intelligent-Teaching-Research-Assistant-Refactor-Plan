# SDD 0344: Student App AI Tutor Result Archive Student Archive Storage Commit

## Problem

SDD 0343 records an append-only student archive persistence command for an approved `AI_TUTOR_RESULT_ARCHIVE` follow-up result, but it intentionally stops before durable storage commit. The next boundary must commit that command through the Teaching Archive use case port while preserving result-archive provenance and keeping JavaScript away from raw database, HTTP, model, retrieval, tool, and Swarm paths.

Without this slice, history-based AI Tutor follow-up can produce a reviewed student archive command, but it cannot become a committed Teaching Archive item that later slices can verify and read.

## Root Requirement Trace

- 学生端：学生基于历史 AI Tutor 结果继续学习后，可见安全 guidance 需要进入学生档案闭环。
- AI辅导助手：结果归档来源必须继续保留 `AI_TUTOR_RESULT_ARCHIVE` 与 `READY_FOR_STUDENT_APP_READ`，不能伪装成普通资料学习动作。
- 学生档案：本切片提交 Teaching Archive 存储结果，但物理行验证仍是后续独立切片。
- Agent Harness：运行时只允许通过注入 Teaching Archive use case port 提交，不允许 JS 直连数据库、HTTP、模型、OCR/RAG、工具或 Swarm。

## Scope

This slice consumes READY SDD 0343 evidence, then commits the result-archive student archive command through the shared SDD 0331 storage commit runtime.

- wrapper runtime id: `student_app_ai_tutor_result_archive_student_archive_storage_commit`
- shared runtime id: `student_app_ai_tutor_result_student_archive_storage_commit_runtime`
- command port: `StudentAppAITutorResultStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand`
- required source runtime: `student_app_ai_tutor_result_archive_student_archive_persistence_command`
- target use case: `CreateArchiveItem.ExecuteWithPersistence`
- target repository: `ArchiveRepository.Create`
- target table: `teaching_archive_items`
- report: `reports/student-app-ai-tutor-result-archive-student-archive-storage-commit.current.json`

## Behavior

1. Accept only READY 0343 result-archive student archive persistence command evidence.
2. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
3. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
4. Require the source command to remain `NOT_COMMITTED_TO_STUDENT_ARCHIVE` before this boundary.
5. Build a Teaching Archive create-item command from safe guidance and student scope only.
6. Invoke exactly one injected `TeachingArchiveCreateItemPort.createArchiveItem`.
7. Require a persisted Teaching Archive outcome before reporting readiness.
8. Preserve source command, safe guidance hash, evidence refs, archive item id, and result-archive metadata.
9. Mark the shared storage result as `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED`.
10. Mark the wrapper workload as `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_STORAGE_COMMITTED`.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-student-archive-persistence-command.current.json`.
- The shared 0331 runtime must accept both the original SDD 0330 command path and the SDD 0343 result-archive command path.
- Output records a persisted Teaching Archive item through `CreateArchiveItem.ExecuteWithPersistence`.
- The underlying shared runtime status remains `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED`.
- Future physical row verification remains a separate reviewed runtime.

## Non-Goals

This slice must not perform physical row verification, direct SQL, direct PostgreSQL driver access, HTTP requests, model inference, prompt construction, OCR/RAG retrieval, tool mutation, Swarm execution, public publication, question-bank draft generation, AI grading, or complete AI Tutor product delivery.

## Safety Boundaries

- Only reviewed safe guidance from the result-archive command may be committed.
- Raw result refs, raw model output, prompts, answer keys, raw content refs, OCR/RAG chunks, direct SQL fields, internal errors, and unreviewed artifacts remain blocked.
- JS records evidence and calls the injected Teaching Archive use case port; it does not own database persistence mechanics.
- Idempotent replay is accepted only when the prior commit evidence matches the current input hash.

## TDD Coverage

- Positive shared runtime test for result-archive-sourced storage commit through the injected port.
- Negative shared runtime test for unsafe result-archive source metadata.
- Audit test for missing 0343 source command readiness.
- Audit test for shared runtime not being result-archive source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove 0343 can be consumed by the shared storage commit runtime without losing result-archive provenance.
- Audit proves 0343 readiness, source-aware shared runtime behavior, single injected port invocation, persisted Teaching Archive outcome, result-archive metadata preservation, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a production load-path configuration.

## Performance Evidence

This is a JS control-plane storage-commit probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors, one injected port call.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0344, the result-archive student archive storage commit audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0331 and SDD 0343 intact so the shared storage commit runtime and result-archive persistence command remain valid reviewed slices.
