# SDD 0377: Student App AI Tutor Question-Bank Feedback Student Archive Persistence Command

## Problem

SDD 0376 creates a Student App renderable delivery envelope for an approved `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` follow-up tutoring result, but it still intentionally stops before archive persistence. The next boundary must record an append-only student archive persistence command for that feedback source without jumping directly to durable storage.

Without this slice, question-bank answer feedback can render in the Student App but cannot enter the reviewed archive persistence pipeline with auditable provenance.

## Root Requirement Trace

- 学生端：学生查看题库答题反馈后的 AI Tutor 追问结果，需要进入后续学生档案闭环。
- AI辅导助手：反馈来源必须保留 `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` 与 `READY_FOR_STUDENT_APP_READ`，不能伪装成普通资料或历史结果学习动作。
- 学生档案：本切片只记录 append-only 命令，durable feedback archive storage commit 仍是独立审核切片。
- Agent Harness：运行时只允许通过共享命令边界记录证据，不允许 JS 直连数据库、HTTP、模型、OCR/RAG、工具或 Swarm。

## Scope

This slice consumes READY SDD 0376 and READY SDD 0372 evidence, then records a question-bank-feedback archive persistence command through the shared SDD 0330 runtime.

- wrapper runtime id: `student_app_ai_tutor_question_bank_feedback_student_archive_persistence_command`
- shared runtime id: `student_app_ai_tutor_result_student_archive_persistence_command_runtime`
- command port: `StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand`
- source runtimes: `student_app_ai_tutor_question_bank_feedback_student_delivery_envelope`, `student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact`
- report: `reports/student-app-ai-tutor-question-bank-feedback-student-archive-persistence-command.current.json`

## Behavior

1. Accept only READY 0376 question-bank-feedback student delivery envelope evidence.
2. Accept only READY 0372 question-bank-feedback controlled answer artifact evidence.
3. Require `learningActionSource = QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`.
4. Require `feedbackStatus = READY_FOR_STUDENT_APP_READ`.
5. Recompute safe guidance section hash from 0372 and require it to match 0376.
6. Require a service principal with `STUDENT_ARCHIVE_PERSISTENCE_RUNTIME`, `TEACHING_READ`, `STUDENT_ARCHIVE_WRITE`, and `STUDENT_APP_DELIVERY`.
7. Record only an append-only persistence command with `NOT_COMMITTED_TO_STUDENT_ARCHIVE`.
8. Preserve question-bank feedback source metadata in the runtime record and command payload.

## Contracts

- Input consumes `reports/student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.current.json` and `reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json`.
- The shared 0330 runtime must accept the original 0329/0325 path, the 0342/0338 result-archive path, and the 0376/0372 question-bank-feedback path.
- Output records `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`.
- The underlying shared status remains `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`.
- Future durable feedback archive storage commit remains a separate reviewed runtime.

## Non-Goals

This slice must not write a student archive row, commit a database transaction, expose HTTP, run model inference, start OCR/RAG retrieval, mutate local tools, run Swarm, generate question-bank drafts, perform AI grading, or claim complete AI Tutor product delivery.

## Safety Boundaries

- Safe guidance text may enter the append-only command because it has already passed the question-bank-feedback review and delivery envelope boundaries.
- Feedback submission ids, feedback ids, source archive ids, raw result refs, raw model output, prompts, answer keys, `contentRef`, OCR/RAG chunks, direct SQL fields, commit results, and internal errors remain blocked.
- Durable student archive persistence, main database writes, student archive writes, model inference, retrieval, HTTP, local mutation, and Swarm remain blocked.
- Idempotent replay is accepted only when the input hash matches.

## TDD Coverage

- Positive shared runtime test for question-bank-feedback-sourced archive persistence command recording.
- Negative shared runtime test for unsafe question-bank-feedback source metadata.
- Audit test for missing 0376 delivery source evidence.
- Audit test for runtime not being question-bank-feedback archive-command source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove 0376 and 0372 can be consumed by the same archive persistence command runtime without losing question-bank feedback provenance.
- Audit proves 0376 readiness, 0372 readiness and guidance hash match, source-aware shared runtime behavior, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a load-path configuration.

## Performance Evidence

This is a JS control-plane probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0377, the question-bank-feedback student archive persistence command audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0330 and SDD 0376 intact so the shared persistence command runtime and question-bank-feedback delivery envelope remain valid.
