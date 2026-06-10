# SDD 0342: Student App AI Tutor Result Archive Student Delivery Envelope

## Problem

SDD 0341 proves that a reviewed `AI_TUTOR_RESULT_ARCHIVE` follow-up result can pass the human student-visibility review boundary. The next boundary must create a Student App renderable delivery envelope for that approved result-archive source without treating it as a normal published-study-packet AI Tutor result and without starting durable student archive persistence.

Without this slice, history-based AI Tutor follow-up can be approved for future delivery but still has no auditable student-render contract that preserves `AI_TUTOR_RESULT_ARCHIVE` provenance.

## Root Requirement Trace

- 学生端：学生可以基于 AI Tutor 历史结果继续学习，但可见内容必须来自受控 envelope。
- AI辅导助手：历史结果追问必须保留来源、经人审后才能进入学生端渲染边界。
- 学生档案：交付前必须保留 `AI_TUTOR_RESULT_ARCHIVE` 与 `READY_FOR_STUDENT_APP_READ` 证据，后续归档仍是独立切片。
- Agent Harness：交付信封只允许通过注入端口生成，不允许 JS runtime 直连数据库、HTTP、工具、OCR/RAG 或 Swarm。

## Scope

This slice consumes READY SDD 0341 and READY SDD 0338 evidence, then records a result-archive student delivery envelope through the shared SDD 0329 runtime.

- wrapper runtime id: `student_app_ai_tutor_result_archive_student_delivery_envelope`
- shared runtime id: `student_app_ai_tutor_result_student_delivery_envelope_runtime`
- command port: `StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope`
- source runtimes: `student_app_ai_tutor_result_archive_student_visibility_review`, `student_app_ai_tutor_result_archive_controlled_answer_artifact`
- report: `reports/student-app-ai-tutor-result-archive-student-delivery-envelope.current.json`

## Behavior

1. Accept only READY 0341 result-archive student visibility review evidence.
2. Accept only READY 0338 result-archive controlled answer artifact evidence.
3. Require `learningActionSource = AI_TUTOR_RESULT_ARCHIVE`.
4. Require `resultArchiveStatus = READY_FOR_STUDENT_APP_READ`.
5. Recompute safe guidance section hash from 0338 and require it to match 0341.
6. Require a service principal with `STUDENT_DELIVERY_RUNTIME`, `TEACHING_READ`, `STUDENT_DELIVERY_ENVELOPE`, and `STUDENT_APP_DELIVERY`.
7. Call only the injected delivery envelope port.
8. Preserve result-archive source metadata in the runtime record and port request.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-archive-student-visibility-review.current.json` and `reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json`.
- The shared delivery runtime must accept both the original 0328/0325 path and the 0341/0338 result-archive path.
- Output records `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED`.
- The underlying envelope state remains `READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED`.
- Future durable student archive persistence remains a separate reviewed runtime.

## Non-Goals

This slice must not persist a student archive row, commit the main database directly from JS, run model inference, start OCR/RAG retrieval, call HTTP, mutate local tools, run Swarm, generate question-bank drafts, perform AI grading, or claim complete AI Tutor product delivery.

## Safety Boundaries

- Safe guidance text may be sent to the delivery port because SDD 0342 creates the render envelope.
- Raw result refs, raw model output, prompts, answer keys, `contentRef`, OCR/RAG chunks, direct SQL fields, and internal errors remain blocked.
- Durable student archive persistence, main database writes, student archive writes, model inference, retrieval, HTTP, local mutation, and Swarm remain blocked.
- Idempotent replay is accepted only when the input hash matches.

## TDD Coverage

- Positive shared runtime test for result-archive-sourced student delivery envelope creation.
- Negative shared runtime test for unsafe result-archive source metadata.
- Audit test for missing 0341 source evidence.
- Audit test for runtime not being result-archive source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and board hooks.

## Acceptance Criteria

- Runtime tests prove 0341 and 0338 can be consumed by the same delivery envelope runtime without losing result-archive provenance.
- Audit proves 0341 readiness, 0338 readiness and guidance hash match, source-aware shared runtime behavior, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice modifies a load-path configuration.

## Performance Evidence

This is a JS control-plane probe and does not change the production10k mixed read/write load path.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove SDD 0342, the result-archive student delivery envelope audit/test/report, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0329 and SDD 0341 intact so the shared delivery runtime and result-archive visibility review remain valid.
