# SDD 0347: Student App AI Tutor Result Archive Student Archive Render

## Problem

SDD 0346 proves that a result-archive-sourced AI Tutor outcome can be read by the Student App as a safe result card. The next product boundary must prove that the same card can be rendered as a safe Student App text-block envelope.

Without this slice, the result-archive branch can read a safe card but cannot prove UI-ready rendering without leaking storage refs, raw model output, prompts, answer keys, HTML, Markdown, or worker internals.

## Root Requirement Trace

- 学生端：学生需要在自己的学生档案中看到 AI Tutor 结果归档的安全展示。
- AI辅导助手：从历史结果继续学习后生成的新结果归档必须保留 `AI_TUTOR_RESULT_ARCHIVE` 和 `READY_FOR_STUDENT_APP_READ` 来源。
- 学生档案：本切片只渲染自己的安全结果卡，不暴露跨学生数据或底层存储引用。
- Agent Harness：运行时只允许通过注入 Student App render port 验证，不允许 JS 直连数据库、HTTP、模型、OCR/RAG、工具或 Swarm。

## Scope

This slice consumes READY SDD 0346 evidence, then verifies the safe render envelope through the shared SDD 0334 render runtime.

- wrapper runtime id: `student_app_ai_tutor_result_archive_student_archive_render`
- shared runtime id: `student_app_ai_tutor_result_student_archive_render_runtime`
- command port: `StudentAppAITutorResultStudentArchiveRenderPort.renderStudentVisibleArchivedResult`
- required source runtime: `student_app_ai_tutor_result_archive_student_archive_read`
- public endpoint contract: `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered`
- use case boundary: `RenderStudentAppAITutorResultArchive.Execute`
- render format: `SAFE_TEXT_BLOCKS`
- report: `reports/student-app-ai-tutor-result-archive-student-archive-render.current.json`

## Behavior

1. Accept only READY 0346 result-archive Student App read evidence.
2. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
3. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
4. Require a `STUDENT` principal from `STUDENT_APP` with `STUDENT_OWN_READ`.
5. Invoke exactly one injected `StudentAppAITutorResultArchiveRenderPort.renderStudentVisibleArchivedResult`.
6. Require the render source to use `RenderStudentAppAITutorResultArchive.Execute`.
7. Require `SAFE_TEXT_BLOCKS` with one `SUMMARY` block and at least one `GUIDANCE_SECTION` block.
8. Record wrapper status `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_ARCHIVE_RENDER_VERIFIED`.
9. Keep the shared runtime status as `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED`.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-student-archive-read.current.json`.
- Output records a safe Student App render envelope for the result-archive branch.
- The shared 0334 runtime must continue accepting the original 0333 path and also accept the 0346 result-archive wrapper path.
- Future learning actions remain a separate reviewed runtime.

## Non-Goals

This slice must not expose learning actions, create a new tutor request, mutate student archive state, execute SQL from JavaScript, execute HTTP from JavaScript, run models, construct prompts, start OCR/RAG retrieval, expose raw `contentRef`, expose raw result refs, render HTML, render Markdown, run tools, or execute Swarm.

## Safety Boundaries

- The Student App render response may include only safe render envelope fields: archive item id, status, material metadata, render format, summary/guidance blocks, guidance hash, safety labels, and created time.
- `contentRef`, raw result refs, raw model output, prompts, answer keys, worker ids, internal errors, SQL details, rendered HTML, rendered Markdown, and raw storage fields remain blocked.
- JavaScript records evidence and calls an injected render port; real read/render behavior remains behind Go use case/repository boundaries.
- Idempotent replay is accepted only when the existing render evidence matches the current input hash.

## TDD Coverage

- Positive shared runtime test for result-archive-sourced safe render through the injected product render port.
- Negative shared runtime test for unsafe result-archive source metadata.
- Go use case test for the result-archive-source safe text-block render envelope.
- Go HTTP test for the result-archive-source rendered endpoint response and leak rejection.
- Audit test for missing 0346 readiness.
- Audit test for shared runtime not being result-archive render source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove 0346 can be consumed by the shared render runtime without losing result-archive provenance.
- Audit proves 0346 readiness, source-aware shared runtime behavior, single injected product render port invocation, safe text-block shape, result-archive metadata preservation, negative test coverage, Go use case and HTTP evidence, OpenAPI contract reuse, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a production load-path configuration.

## Performance Evidence

This is a JS control-plane safe render probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors, one injected product render port call.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0347, the result-archive student archive render audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, architecture-board note, and the result-archive-source Go use case/HTTP tests. Keep SDD 0334 and SDD 0346 intact so the shared safe render runtime and result-archive safe read verification remain valid reviewed slices.
