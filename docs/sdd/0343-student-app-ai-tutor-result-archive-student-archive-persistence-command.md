# SDD 0343: Student App AI Tutor Result Archive Student Archive Persistence Command

## Problem

SDD 0342 creates a Student App renderable delivery envelope for an approved `AI_TUTOR_RESULT_ARCHIVE` follow-up result, but it still intentionally stops before archive persistence. The next boundary must record an append-only student archive persistence command for that result-archive source without jumping directly to durable storage.

Without this slice, history-based AI Tutor follow-up can render in the Student App but cannot enter the reviewed archive persistence pipeline with auditable provenance.

## Root Requirement Trace

- 学生端：学生基于历史 AI Tutor 结果继续学习后，可见结果需要进入后续学生档案闭环。
- AI辅导助手：结果归档来源必须保留 `AI_TUTOR_RESULT_ARCHIVE` 与 `READY_FOR_STUDENT_APP_READ`，不能伪装成普通资料学习动作。
- 学生档案：本切片只记录 append-only 命令，durable storage commit 仍是独立审核切片。
- Agent Harness：运行时只允许通过共享命令边界记录证据，不允许 JS 直连数据库、HTTP、模型、OCR/RAG、工具或 Swarm。

## Scope

This slice consumes READY SDD 0342 and READY SDD 0338 evidence, then records a result-archive archive persistence command through the shared SDD 0330 runtime.

- wrapper runtime id: `student_app_ai_tutor_result_archive_student_archive_persistence_command`
- shared runtime id: `student_app_ai_tutor_result_student_archive_persistence_command_runtime`
- command port: `StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand`
- source runtimes: `student_app_ai_tutor_result_archive_student_delivery_envelope`, `student_app_ai_tutor_result_archive_controlled_answer_artifact`
- report: `reports/student-app-ai-tutor-result-archive-student-archive-persistence-command.current.json`

## Behavior

1. Accept only READY 0342 result-archive student delivery envelope evidence.
2. Accept only READY 0338 result-archive controlled answer artifact evidence.
3. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
4. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
5. Recompute safe guidance section hash from 0338 and require it to match 0342.
6. Require a service principal with `STUDENT_ARCHIVE_PERSISTENCE_RUNTIME`, `TEACHING_READ`, `STUDENT_ARCHIVE_WRITE`, and `STUDENT_APP_DELIVERY`.
7. Record only an append-only persistence command with `NOT_COMMITTED_TO_STUDENT_ARCHIVE`.
8. Preserve result-archive source metadata in the runtime record and command payload.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-student-delivery-envelope.current.json` and `reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json`.
- The shared 0330 runtime must accept both the original 0329/0325 path and the 0342/0338 result-archive path.
- Output records `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`.
- The underlying shared status remains `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`.
- Future durable archive storage commit remains a separate reviewed runtime.

## Non-Goals

This slice must not write a student archive row, commit a database transaction, expose HTTP, run model inference, start OCR/RAG retrieval, mutate local tools, run Swarm, generate question-bank drafts, perform AI grading, or claim complete AI Tutor product delivery.

## Safety Boundaries

- Safe guidance text may enter the append-only command because it has already passed the result-archive review and delivery envelope boundaries.
- Raw result refs, raw model output, prompts, answer keys, `contentRef`, OCR/RAG chunks, direct SQL fields, commit results, and internal errors remain blocked.
- Durable student archive persistence, main database writes, student archive writes, model inference, retrieval, HTTP, local mutation, and Swarm remain blocked.
- Idempotent replay is accepted only when the input hash matches.

## TDD Coverage

- Positive shared runtime test for result-archive-sourced archive persistence command recording.
- Negative shared runtime test for unsafe result-archive source metadata.
- Audit test for missing 0342 delivery source evidence.
- Audit test for runtime not being result-archive archive-command source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove 0342 and 0338 can be consumed by the same archive persistence command runtime without losing result-archive provenance.
- Audit proves 0342 readiness, 0338 readiness and guidance hash match, source-aware shared runtime behavior, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a load-path configuration.

## Performance Evidence

This is a JS control-plane probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0343, the result-archive student archive persistence command audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0330 and SDD 0342 intact so the shared persistence command runtime and result-archive delivery envelope remain valid.
