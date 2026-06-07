# SDD 0278 - Student App AI Tutor Question-Bank Draft Generation Plan

## Problem

SDD 0262 records a successful Student App AI Tutor result with a
`questionBankDraftRef`, but that result is still only analysis evidence. The
system needs a reviewed control-plane step that turns the result into a bounded
question-bank generation plan before any model worker, generated question
content, or storage commit is allowed.

Without this slice, later question generation could accidentally collapse
planning, model execution, content writes, answering, scoring, and publication
into one unsafe operation. This slice separates the plan from execution.

## Scope

Add a Student App AI Tutor question-bank draft generation plan runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan`.

This slice:

- consumes only a READY Student App AI Tutor result runtime report;
- requires the source result status `STUDENT_APP_AI_TUTOR_RESULT_RECORDED`;
- requires a local `questionBankDraftRef`;
- records `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED`;
- requires SERVICE + AGENT_INTERNAL principal scope with `TEACHING_WRITE`,
  `STUDENT_ARCHIVE_WRITE`, and `AGENT_COMMAND_SUBMIT`;
- requires OWN student scope and matching `archiveItemId`;
- records learning objectives, planned items, budget, prompt blueprints, and
  evidence refs;
- writes only append-only generation-plan evidence through the injected port;
- supports idempotent replay and rejects conflicting plans;
- blocks model inference, generated question content, question-bank content
  writes, student answering, scoring, student-visible publication, direct DB
  access, HTTP execution, local tool mutation, remote device control, and
  Swarm.

This is not a question generation runtime and not a content storage runtime.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-plan-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-plan-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-plan-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-plan-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-result.current.json`
- Future generation use case named in the plan:
  `GenerateQuestionBankDraftContent.Execute`
- Future storage repository named in the plan:
  `ArchiveRepository.SaveQuestionBankDraftContent`
- Future storage table named in the plan:
  `teaching_question_bank_draft_contents`

The append-only generation-plan log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-plan.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive planning, idempotent replay,
  conflicting replay, missing port, unsafe principal, wrong source status,
  unsafe policies, cross-student mismatch, invalid budget, duplicate items,
  missing evidence, leaked answer keys, and leaked model output.
- Audit tests pass and prove the source Student App AI Tutor result is READY
  with a local draft ref.
- `npm run audit:student-app-ai-tutor-question-bank-draft-generation-plan`
  reports `READY`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftGenerationPlan`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft generation plan runtime audit`.
- The architecture board states 10.18/10 as
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED` evidence
  while real model generation, content storage, answering, scoring, complete
  AI Tutor productization, and public release remain future reviewed slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed
control-plane planning record, not a new hot-path worker, pool size, query
shape, or database configuration. Its local probe budget is P99 <= 50ms.

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

Remove the 0278 runtime, tests, audit, audit tests, report, generation-plan
log output, `package.json` audit script, strict quality hook, root workflow
coverage hook, structure verifier entries, SDD, and architecture-board 10.18
text. Keep 0260-0277 intact because Student App AI Tutor request, worker
claim, result, question-bank visibility/content, answer submission, scoring
request/input/result, completion bridge, publication precheck, reviewed
feedback artifact, publication approval, delivery envelope, archive persistence
command, archive storage commit, and archive row verification remain valid
independent slices.
