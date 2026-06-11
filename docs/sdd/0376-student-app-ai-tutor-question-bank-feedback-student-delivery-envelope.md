# SDD 0376: Student App AI Tutor Question-Bank Feedback Student Delivery Envelope

## Problem

SDD 0375 proves that `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` tutoring has a
teacher/admin student-visibility approval. That approval still is not a
renderable Student App envelope.

Without this slice, question-bank feedback tutoring can be approved for future
delivery but cannot be audited as a student-facing envelope, or it may be
incorrectly skipped straight to durable archive persistence.

## Root Requirement Trace

- 学生端：学生可以围绕题库反馈继续学习，但学生可见内容必须受控。
- AI辅导助手：题库反馈来源必须经过安全读取、渲染、学习动作、模型预检、受控答案、人审、持久化、学生可见性审查和交付信封。
- 学生档案：交付信封仍不代表 durable 学生档案落库；后续归档必须另起 reviewed slice。
- Agent Harness：交付信封只能通过注入端口记录，不允许 JS runtime 直连数据库、HTTP、工具、OCR/RAG 或 Swarm。

## Scope

This slice consumes READY SDD 0375 visibility review evidence and READY SDD
0372 controlled answer artifact evidence, then records a question-bank-feedback
student delivery envelope through the shared SDD 0329 runtime.

- wrapper runtime id: `student_app_ai_tutor_question_bank_feedback_student_delivery_envelope`
- shared runtime id: `student_app_ai_tutor_result_student_delivery_envelope_runtime`
- command port: `StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope`
- source runtimes:
  `student_app_ai_tutor_question_bank_feedback_student_visibility_review`,
  `student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact`
- report:
  `reports/student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.current.json`

## Behavior

1. Accept only READY 0375 question-bank-feedback student visibility review evidence.
2. Accept only READY 0372 question-bank-feedback controlled answer artifact evidence.
3. Recompute safe guidance section hash from 0372 and require it to match 0375.
4. Require `learningActionSource = QUESTION_BANK_DRAFT_ANSWER_FEEDBACK`.
5. Require `feedbackStatus = READY_FOR_STUDENT_APP_READ`.
6. Require a `SERVICE` principal with `STUDENT_DELIVERY_RUNTIME`,
   `TEACHING_READ`, `STUDENT_DELIVERY_ENVELOPE`, and `STUDENT_APP_DELIVERY`.
7. Call only the injected student delivery envelope port.
8. Produce `READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED` envelope evidence for
   Student App rendering.

## Contracts

- The injected port receives delivery request metadata, source visibility
  metadata, safe guidance sections, scope ref, evidence refs, and safety flags.
- The injected port must not receive raw result refs, feedback submission ids,
  source archive ids, raw answers, raw model output, prompts, answer keys,
  `contentRef`, OCR/RAG chunks, direct DB fields, or internal errors.
- Output records
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED`.
- Output preserves `QUESTION_BANK_DRAFT_ANSWER_FEEDBACK` and
  `READY_FOR_STUDENT_APP_READ`.
- Durable feedback archive persistence remains a later reviewed runtime.

## Non-Goals

This slice does not persist student archive rows, write the main database,
commit durable archive state, run model inference, construct prompts, call
OCR/RAG, execute HTTP, mutate local tools, start Swarm, or claim the full AI
Tutor product is complete.

## Safety Boundaries

- Safe guidance text may be sent to the delivery port.
- Raw result refs, raw model output, prompts, answer keys, feedback ids,
  source archive ids, `contentRef`, OCR/RAG chunks, DB write results, and
  internal errors remain blocked.
- `durableStudentArchivePersistenceStarted=false`.
- `mainDatabaseWriteStarted=false`.
- `studentArchiveWriteStarted=false`.
- Idempotent replay is accepted only when the input hash matches.

## TDD Coverage

- Positive shared runtime test for question-bank-feedback-sourced student
  delivery envelope.
- Negative shared runtime test for unsafe question-bank-feedback source
  metadata.
- Audit test for missing 0375 visibility review evidence.
- Audit test for runtime not being question-bank-feedback source aware.
- Audit test for missing regression tests.
- Audit test for missing package, quality, root workflow, structure, trace, and
  board hooks.

## Acceptance Criteria

- Runtime tests prove that 0375 and 0372 can produce a Student App renderable
  envelope without durable persistence.
- Audit proves 0375 readiness, 0372 guidance hash match, shared runtime source
  awareness, runtime probe, no raw refs/feedback ids to the port, negative test
  coverage, quality gate hook, root workflow coverage hook, structure verifier
  hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.
- Full-system production10k evidence remains unchanged unless this slice
  modifies a load-path configuration.

## Performance Evidence

This is a JS control-plane probe. It validates two READY reports, recomputes one
safe guidance hash, calls one injected command port, and appends one JSONL
evidence record.

- Target P99: 50ms.
- Expected audit probe: P99 <= 50ms, 0 errors.
- Whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`,
  `0 errors`.

## Rollback

Remove SDD 0376, the question-bank-feedback student delivery envelope
audit/test/report, package script, quality-gate entry, root workflow coverage
hook, structure verifier entry, root trace row, and architecture-board note.
Keep SDD 0329, SDD 0372, and SDD 0375 intact so the shared delivery runtime and
question-bank feedback approval boundary remain valid.
