# SDD 0281 - Student App AI Tutor Question-Bank Draft Generation Input Envelope

## Problem

SDD 0280 proves a local StudentTutorAgent worker has claimed a question-bank
generation plan, but the system still lacks a safe model-input boundary between
the lease claim and future question generation.

Without this slice, later model work could accidentally start from raw plan
objects, leak answer keys, bypass worker lease evidence, or write generated
content before the input contract is reviewed.

## Scope

Add a Student App AI Tutor question-bank draft generation input-envelope
runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftGenerationInputEnvelopePort.recordGenerationInputEnvelope`.

This slice:

- consumes a READY 0278 question-bank generation plan report;
- consumes a READY 0280 generation worker claim report;
- requires both sources to reference the same not-yet-generated plan;
- requires `CLAIMED_NOT_GENERATED`;
- requires SERVICE + AGENT_INTERNAL principal scope with `TEACHING_WRITE`,
  `STUDENT_ARCHIVE_WRITE`, and `AGENT_COMMAND_SUBMIT`;
- requires the worker identity, skill, lease, and concurrency values to match
  the claim;
- records
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED`;
- records `INPUT_ENVELOPE_RECORDED_NOT_GENERATED`;
- prepares prompt blueprints, learning objectives, source evidence refs, and
  budget data for a future reviewed model-generation slice;
- excludes answer keys, expected answers, raw model output, generated question
  text, and content rows;
- blocks model inference, generated question content, question-bank content
  writes, student answering, scoring, student-visible publication, direct DB
  access, HTTP execution, local tool mutation, remote device control, and
  Swarm.

This is not a model generation runtime and not a content storage runtime.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json`
- Source generation plan evidence:
  `reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json`
- Source worker claim evidence:
  `reports/student-app-ai-tutor-question-bank-draft-generation-worker-claim.current.json`
- Target use case:
  `PrepareQuestionBankDraftGenerationInputEnvelope.Execute`
- Future generation use case:
  `GenerateQuestionBankDraftContent.Execute`
- Future storage repository:
  `ArchiveRepository.SaveQuestionBankDraftContent`
- Future storage table:
  `teaching_question_bank_draft_contents`

The append-only input-envelope log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-input-envelope.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive envelope recording, idempotent replay,
  conflicting replay, missing port, unsafe principal, worker mismatch, unsafe
  policy, non-ready source report, plan/claim mismatch, already-generated
  boundary evidence, leaked answer/model/content fields, unsafe port results,
  and missing evidence refs.
- Audit tests pass and prove the source generation plan and source worker claim
  are READY, matched, and still not generated.
- `npm run audit:student-app-ai-tutor-question-bank-draft-generation-input-envelope`
  reports `READY`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftGenerationInputEnvelope`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft generation input envelope runtime audit`.
- The architecture board states 10.21/10 as
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_INPUT_ENVELOPE_RECORDED`
  evidence while model generation, content storage, answering, scoring,
  complete AI Tutor productization, and public release remain future reviewed
  slices.

## Performance

This slice does not rerun `production10k` because it adds a reviewed
control-plane input-envelope record, not a new production query implementation,
database pool tuning, worker-count change, or content write hot path. Its local
probe budget is P99 <= 50ms.

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

Remove the 0281 runtime, tests, audit, audit tests, report, input-envelope log
output, `package.json` audit script, strict quality hook, root workflow coverage
hook, structure verifier entries, SDD, and architecture-board 10.21 text. Keep
0260-0280 intact because Student App AI Tutor request, worker claim, result,
question-bank generation plan, worker precheck, and worker claim slices remain
valid independent evidence.
