# SDD 0283 - Student App AI Tutor Question-Bank Draft Generation Controlled Draft

## Problem

SDD 0282 proves a reviewed model-execution precheck exists, but the system still
lacks a controlled generation boundary that records the model-produced question
draft artifact without immediately storing it in the student-visible question
bank content table.

Without this slice, future model work could mix raw model output, answer keys,
question-bank content storage, and publication in one step. That would make the
AI Tutor flow hard to audit and unsafe for students.

## Scope

Add a Student App AI Tutor question-bank draft generation controlled-draft
runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftGenerationControlledDraftPort.recordControlledDraftGeneration`.

This slice:

- consumes a READY 0281 question-bank generation input-envelope report;
- consumes a READY 0282 model-execution precheck report;
- requires both sources to reference the same envelope, plan, claim, draft ref,
  student, worker, and blueprint count;
- requires `INPUT_ENVELOPE_RECORDED_NOT_GENERATED`;
- requires `MODEL_EXECUTION_PRECHECKED_NOT_STARTED`;
- requires SERVICE + AGENT_INTERNAL principal scope with `TEACHING_WRITE`,
  `STUDENT_ARCHIVE_WRITE`, `AGENT_COMMAND_SUBMIT`, and
  `MODEL_GENERATION_EXECUTE`;
- records
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED`;
- records `CONTROLLED_DRAFT_RECORDED_NOT_STORED`;
- records sanitized question draft items for teacher review;
- preserves blueprint linkage, difficulty, question type, knowledge point,
  hint policy, and source evidence refs;
- excludes raw model output, answer keys, expected answers, explanations,
  score summaries, content rows, internal errors, and direct database fields;
- blocks question-bank content writes, student answering, scoring,
  student-visible publication, direct DB access, HTTP execution, local tool
  mutation, remote device control, and Swarm.

This is not a question-bank content storage runtime, not a student publication
runtime, and not an answer-key generation runtime.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-controlled-draft.current.json`
- Source input-envelope evidence:
  `reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json`
- Source model-execution precheck evidence:
  `reports/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.current.json`
- Target use case:
  `RecordQuestionBankDraftControlledGeneration.Execute`
- Future review use case:
  `ReviewQuestionBankDraftGeneratedContent.Execute`
- Future storage repository:
  `ArchiveRepository.SaveQuestionBankDraftContent`
- Future storage table:
  `teaching_question_bank_draft_contents`

The append-only controlled draft log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-controlled-draft.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive controlled draft recording,
  idempotent replay, conflicting replay, missing port, unsafe principal,
  unsafe output policy, source mismatch, non-ready source state, leaked
  answer/model fields, unsafe port results, unknown items, content storage
  flags, and missing evidence refs.
- Audit tests pass and prove the source input envelope and source model
  precheck are READY, matched, and still not stored.
- `npm run audit:student-app-ai-tutor-question-bank-draft-generation-controlled-draft`
  reports `READY`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftGenerationControlledDraft`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft generation controlled draft runtime audit`.
- The architecture board states 10.23/10 as
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED`
  evidence while teacher review, content storage, student answering, scoring,
  student-visible publication, complete AI Tutor productization, and public
  release remain future reviewed slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed
control-plane draft artifact boundary, not a new production query
implementation, database pool tuning, worker-count change, or content write hot
path. Its local probe budget is P99 <= 50ms.

Current whole-system evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. That evidence supports the 50ms production target
for the current durable mixed workload. It does not prove a sub-10ms production
standard, and it does not include future model inference, RAG, OCR, or full
question-bank content storage.

The current system is comparable to a high-concurrency internal business API
or SaaS backend under a durable mixed workload. It should not be compared to
Redis, Nginx, Envoy, or other pure in-memory/cache/gateway paths. The remaining
performance bottleneck is the durable business path: PostgreSQL read/write,
authorization, audit evidence, safety boundaries, queue/worker coordination,
and future model/RAG latency.

## Rollback

Remove the 0283 runtime, tests, audit, audit tests, report, controlled draft
log output, `package.json` audit script, strict quality hook, root workflow
coverage hook, structure verifier entries, SDD, and architecture-board 10.23
text. Keep 0260-0282 intact because Student App AI Tutor request, worker claim,
result, question-bank generation plan, worker precheck, worker claim, input
envelope, and model execution precheck slices remain valid independent evidence.
