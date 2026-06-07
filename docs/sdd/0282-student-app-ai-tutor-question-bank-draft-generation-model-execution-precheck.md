# SDD 0282 - Student App AI Tutor Question-Bank Draft Generation Model Execution Precheck

## Problem

SDD 0281 prepares a safe model-input envelope for future question-bank draft
generation, but the system still lacks a reviewed gate that decides whether the
claimed worker may enter a controlled model execution queue.

Without this slice, later model work could start generation directly after the
input envelope, bypass teacher/admin review, ignore token budgets, or blur the
boundary between queue admission, model inference, generated content, and
durable content storage.

## Scope

Add a Student App AI Tutor question-bank draft generation model-execution
precheck runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftGenerationModelExecutionPrecheckPort.recordModelExecutionPrecheck`.

This slice:

- consumes a READY 0281 question-bank generation input-envelope report;
- requires `INPUT_ENVELOPE_RECORDED_NOT_GENERATED`;
- requires SERVICE + AGENT_INTERNAL principal scope with `TEACHING_WRITE`,
  `STUDENT_ARCHIVE_WRITE`, `AGENT_COMMAND_SUBMIT`, and
  `MODEL_EXECUTION_PRECHECK_APPROVE`;
- requires a TEACHER or ADMIN approval record with
  `QUESTION_BANK_GENERATION_REVIEW` and `MODEL_EXECUTION_PRECHECK_APPROVE`;
- requires the approval to match the envelope, plan, and worker claim;
- requires prompt blueprints, student own scope, answer-key exclusion, and
  generation budget review;
- records
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED`;
- records `MODEL_EXECUTION_PRECHECKED_NOT_STARTED`;
- admits only a future reviewed model queue route,
  `StudentTutorAgent.generate_question_bank_draft`;
- blocks immediate model inference, generated question content, question-bank
  content writes, student answering, scoring, student-visible publication,
  direct DB access, HTTP execution, local tool mutation, remote device control,
  and Swarm.

This is not a model inference runtime and not a content storage runtime.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.current.json`
- Source input-envelope evidence:
  `reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json`
- Target use case:
  `PrecheckQuestionBankDraftGenerationModelExecution.Execute`
- Future model-generation use case:
  `GenerateQuestionBankDraftContent.Execute`
- Future storage repository:
  `ArchiveRepository.SaveQuestionBankDraftContent`
- Future storage table:
  `teaching_question_bank_draft_contents`

The append-only precheck log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive precheck recording, idempotent replay,
  conflicting replay, missing port, unsafe principal, incomplete approval,
  unsafe policy, non-ready source envelope, approval mismatch, already-generated
  boundary evidence, leaked answer/model/content fields, unsafe port results,
  over-budget policies, and missing evidence refs.
- Audit tests pass and prove the source input envelope is READY and still not
  generated.
- `npm run audit:student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck`
  reports `READY`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft generation model execution precheck runtime audit`.
- The architecture board states 10.22/10 as
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_MODEL_EXECUTION_PRECHECKED`
  evidence while actual model inference, generated content, content storage,
  answering, scoring, complete AI Tutor productization, and public release
  remain future reviewed slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed
control-plane model queue admission record, not a new production query
implementation, database pool tuning, worker-count change, or content write hot
path. Its local probe budget is P99 <= 50ms.

Current whole-system evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. That evidence supports the 50ms production target
for the current durable mixed workload. It does not prove a sub-10ms production
standard, and it does not include future model inference, RAG, OCR, or full
question generation.

The current system is comparable to a high-concurrency internal business API
or SaaS backend under a durable mixed workload. It should not be compared to
Redis, Nginx, Envoy, or other pure in-memory/cache/gateway paths. The remaining
performance bottleneck is the durable business path: PostgreSQL read/write,
authorization, audit evidence, safety boundaries, queue/worker coordination,
and future model/RAG latency.

## Rollback

Remove the 0282 runtime, tests, audit, audit tests, report, precheck log
output, `package.json` audit script, strict quality hook, root workflow
coverage hook, structure verifier entries, SDD, and architecture-board 10.22
text. Keep 0260-0281 intact because Student App AI Tutor request, worker claim,
result, question-bank generation plan, worker precheck, worker claim, and input
envelope slices remain valid independent evidence.
