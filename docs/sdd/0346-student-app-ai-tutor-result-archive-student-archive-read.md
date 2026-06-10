# SDD 0346: Student App AI Tutor Result Archive Student Archive Read

## Problem

SDD 0345 verifies that the `AI_TUTOR_RESULT_ARCHIVE` branch has a physical Teaching Archive row, but the Student App still needs a safe read-card proof before the learner can see that archived result.

Without this slice, the result-archive branch can prove storage durability but cannot prove that the existing Student App read boundary returns only safe guidance fields.

## Root Requirement Trace

- 学生端：学生需要在自己的学生档案中读取 AI Tutor 结果归档卡。
- AI辅导助手：历史结果继续学习后生成的新归档仍必须保留 `AI_TUTOR_RESULT_ARCHIVE` 与 `READY_FOR_STUDENT_APP_READ` 来源。
- 学生档案：本切片只读取自己的安全结果卡，不暴露跨学生数据或底层存储引用。
- Agent Harness：运行时只允许通过注入 Student App AI Tutor result archive read port 验证，不允许 JS 直连数据库、HTTP、模型、OCR/RAG、工具或 Swarm。

## Scope

This slice consumes READY SDD 0345 evidence, then verifies the safe Student App result-card read through the shared SDD 0333 read runtime.

- wrapper runtime id: `student_app_ai_tutor_result_archive_student_archive_read`
- shared runtime id: `student_app_ai_tutor_result_student_archive_read_runtime`
- command port: `StudentAppAITutorResultStudentArchiveReadPort.readStudentVisibleArchivedResult`
- required source runtime: `student_app_ai_tutor_result_archive_student_archive_row_verification`
- public endpoint contract: `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result`
- use case boundary: `ReadStudentAppAITutorResultArchive.Execute`
- snapshot repository boundary: `ArchiveRepository.GetStudentAppAITutorResultArchiveSnapshot`
- report: `reports/student-app-ai-tutor-result-archive-student-archive-read.current.json`

## Behavior

1. Accept only READY 0345 result-archive student archive row verification evidence.
2. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
3. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
4. Require a `STUDENT` principal from `STUDENT_APP` with `STUDENT_OWN_READ`.
5. Invoke exactly one injected `StudentAppAITutorResultArchiveReadPort.readStudentVisibleArchivedResult`.
6. Require the read source to use `ReadStudentAppAITutorResultArchive.Execute`.
7. Require the safe card to match the 0345 archive item and safe guidance snapshot.
8. Record wrapper status `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_READ_VERIFIED`.
9. Keep the shared runtime status as `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED`.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-student-archive-row-verification.current.json`.
- Output records a safe Student App result-card read for `tarch_student_ai_tutor_result_001`.
- The shared 0333 runtime must continue accepting the original 0332 path and also accept the 0345 result-archive wrapper path.
- Future safe render remains a separate reviewed runtime.

## Non-Goals

This slice must not render HTML or Markdown, expose learning actions, create a new tutor request, mutate student archive state, execute SQL from JavaScript, execute HTTP from JavaScript, run models, construct prompts, start OCR/RAG retrieval, expose raw `contentRef`, expose raw result refs, run tools, or execute Swarm.

## Safety Boundaries

- The Student App response may include only the safe card fields: archive item id, status, material metadata, summary, guidance sections, guidance hash, safety labels, and created time.
- `contentRef`, raw result refs, raw model output, prompts, answer keys, worker ids, internal errors, SQL details, and raw storage fields remain blocked.
- JavaScript records evidence and calls an injected read port; real persistence remains behind Go use case/repository boundaries.
- Idempotent replay is accepted only when the existing read evidence matches the current input hash.

## TDD Coverage

- Positive shared runtime test for result-archive-sourced safe read through the injected product read port.
- Negative shared runtime test for unsafe result-archive source metadata.
- Go use case test for the result-archive-source safe guidance card.
- Go HTTP test for the result-archive-source Student App endpoint response and leak rejection.
- Audit test for missing 0345 readiness.
- Audit test for shared runtime not being result-archive read source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove 0345 can be consumed by the shared read runtime without losing result-archive provenance.
- Audit proves 0345 readiness, source-aware shared runtime behavior, single injected product read port invocation, safe card shape, result-archive metadata preservation, negative test coverage, Go use case and HTTP evidence, OpenAPI contract reuse, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a production load-path configuration.

## Performance Evidence

This is a JS control-plane safe read probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors, one injected product read port call.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0346, the result-archive student archive read audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, architecture-board note, and the result-archive-source Go use case/HTTP tests. Keep SDD 0333 and SDD 0345 intact so the shared safe read runtime and result-archive physical row verification remain valid reviewed slices.
