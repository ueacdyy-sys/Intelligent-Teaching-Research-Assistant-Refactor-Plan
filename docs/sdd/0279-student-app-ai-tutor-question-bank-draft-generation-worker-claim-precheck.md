# SDD 0279 - Student App AI Tutor Question-Bank Draft Generation Worker Claim Precheck

## Problem

SDD 0278 records a question-bank draft generation plan, but the plan is still
not safe to hand to a generator worker until the system proves worker identity,
lease policy, budget coverage, source plan state, and safety boundaries.

Without this slice, future question generation could accidentally combine plan
claim, model execution, question content generation, storage commit, student
answering, scoring, and publication into one unreviewed operation. This slice
adds a worker-claim precheck before any actual generation claim exists.

## Scope

Add a Student App AI Tutor question-bank draft generation worker claim precheck
runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPrecheckPort.recordGenerationWorkerClaimPrecheck`.

This slice:

- consumes only a READY 0278 generation-plan report;
- requires `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED`;
- requires `PLAN_RECORDED_NOT_GENERATED`;
- requires SERVICE + AGENT_INTERNAL principal scope with `TEACHING_WRITE`,
  `STUDENT_ARCHIVE_WRITE`, and `AGENT_COMMAND_SUBMIT`;
- requires a `StudentTutorAgent` worker with skill
  `generate_question_bank_draft`;
- checks worker lease and planned question budget before future claim;
- records `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED`;
- writes only append-only precheck evidence through the injected port;
- supports idempotent replay and rejects conflicting prechecks;
- blocks actual plan claim, model inference, generated question content,
  question-bank content writes, student answering, scoring, student-visible
  publication, direct DB access, HTTP execution, local tool mutation, remote
  device control, and Swarm.

This is not a generation worker, not an atomic queue claim, and not a content
storage runtime.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json`
- Future claim use case:
  `ClaimQuestionBankDraftGenerationPlan.Execute`
- Future generation use case:
  `GenerateQuestionBankDraftContent.Execute`
- Future storage repository:
  `ArchiveRepository.SaveQuestionBankDraftContent`
- Future storage table:
  `teaching_question_bank_draft_contents`

The append-only precheck log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive precheck, idempotent replay,
  conflicting replay, missing port, unsafe principal, invalid worker, unsafe
  policy, missing plan evidence, generated plan state, insufficient worker
  budget, leaked answer keys, generated content, and leaked model output.
- Audit tests pass and prove the source 0278 generation plan is READY and still
  `PLAN_RECORDED_NOT_GENERATED`.
- `npm run audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck`
  reports `READY`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftGenerationWorkerClaimPrecheck`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft generation worker claim precheck runtime audit`.
- The architecture board states 10.19/10 as
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED`
  evidence while actual worker claim, model generation, content storage,
  answering, scoring, complete AI Tutor productization, and public release
  remain future reviewed slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed
control-plane precheck record, not a new hot-path query, database pool,
worker-count setting, or storage write path. Its local probe budget is
P99 <= 50ms.

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

Remove the 0279 runtime, tests, audit, audit tests, report, precheck log output,
`package.json` audit script, strict quality hook, root workflow coverage hook,
structure verifier entries, SDD, and architecture-board 10.19 text. Keep
0260-0278 intact because Student App AI Tutor request, worker claim, result,
question-bank generation plan, visibility/content, answer submission, scoring,
publication, and archive verification slices remain valid independent evidence.
