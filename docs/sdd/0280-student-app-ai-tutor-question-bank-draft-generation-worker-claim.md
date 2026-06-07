# SDD 0280 - Student App AI Tutor Question-Bank Draft Generation Worker Claim

## Problem

SDD 0279 proves a generation worker is eligible to claim a question-bank
generation plan, but it still does not record the actual atomic claim and lease.
The next boundary must prove that a specific worker has claimed one generation
plan before any model execution or content storage is allowed.

Without this slice, later generation work could start from a precheck without a
durable claim identity, lease window, idempotency key, or skip-locked queue
semantics.

## Scope

Add a Student App AI Tutor question-bank draft generation worker claim runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftGenerationWorkerClaimPort.claimGenerationPlan`.

This slice:

- consumes only a READY 0279 generation worker claim precheck report;
- requires `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIM_PRECHECKED`;
- requires `PRECHECKED_NOT_CLAIMED`;
- requires SERVICE + AGENT_INTERNAL principal scope with `TEACHING_WRITE`,
  `STUDENT_ARCHIVE_WRITE`, and `AGENT_COMMAND_SUBMIT`;
- requires the worker identity, skill, lease, and concurrency values to match
  the precheck;
- records `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED`;
- records an `IN_PROGRESS` claim with `CLAIMED_NOT_GENERATED` execution state;
- requires atomic skip-locked claim semantics through the injected port;
- supports idempotent replay and rejects conflicting claims;
- blocks model inference, generated question content, question-bank content
  writes, student answering, scoring, student-visible publication, direct DB
  access, HTTP execution, local tool mutation, remote device control, and
  Swarm.

This is not a model generation runtime and not a content storage runtime.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.current.json`
- Repository operation:
  `ArchiveRepository.ClaimQuestionBankDraftGenerationPlan`
- Future generation use case:
  `GenerateQuestionBankDraftContent.Execute`
- Future storage repository:
  `ArchiveRepository.SaveQuestionBankDraftContent`
- Future storage table:
  `teaching_question_bank_draft_contents`

The append-only claim log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-worker-claim.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive claim, idempotent replay, conflicting
  replay, missing port, unsafe principal, worker mismatch, unsafe policy,
  missing precheck evidence, non-ready precheck, already-claimed precheck,
  leaked answer/model/content fields, and unsafe port results.
- Audit tests pass and prove the source 0279 precheck is READY and still
  `PRECHECKED_NOT_CLAIMED`.
- `npm run audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim`
  reports `READY`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftGenerationWorkerClaim`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft generation worker claim runtime audit`.
- The architecture board states 10.20/10 as
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_WORKER_CLAIMED`
  evidence while model generation, content storage, answering, scoring,
  complete AI Tutor productization, and public release remain future reviewed
  slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed
control-plane claim record, not a new production query implementation, database
pool tuning, worker-count change, or content write hot path. Its local probe
budget is P99 <= 50ms.

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

Remove the 0280 runtime, tests, audit, audit tests, report, claim log output,
`package.json` audit script, strict quality hook, root workflow coverage hook,
structure verifier entries, SDD, and architecture-board 10.20 text. Keep
0260-0279 intact because Student App AI Tutor request, worker claim, result,
question-bank generation plan, worker precheck, visibility/content, answer
submission, scoring, publication, and archive verification slices remain valid
independent evidence.
