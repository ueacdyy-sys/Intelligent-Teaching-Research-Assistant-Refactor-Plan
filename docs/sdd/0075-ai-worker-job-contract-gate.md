# SDD 0075: AI Worker Job Contract Gate

## Problem

P7 starts the Knowledge And AI Workers boundary. The root requirements require
public/private knowledge isolation, node-specific access rules, OCR-ready
teaching workflows, RAG retrieval, and private fine-tuning export. These
capabilities need Python worker dependencies eventually, but the baseline
desktop/runtime must stay small and stable.

Without a worker job contract gate, later RAG, OCR, or fine-tuning work could
accidentally pull model packages into the baseline runtime, let cloud nodes read
private knowledge, let remote-device nodes read local knowledge, or let workers
write directly into the main database instead of returning bounded artifacts.

## Source Requirement References

- Root requirement: cloud nodes may access only public knowledge, local nodes may
  access public and private knowledge, and remote-device nodes must not access
  this machine's knowledge base.
- Root requirement: the knowledge base has public and private partitions and
  retrieval efficiency must be improved over the old chunking-only model.
- Root requirement: OCR/handwriting recognition is reserved for AI grading.
- Root requirement: private model fine-tuning can use cleaned favorites or
  uploaded private data and export GGUF for local nodes.
- Whole-system module map: P7 requires retrieval policy, RAG/OCR/training worker
  isolation, no direct main database writes, and worker dependency isolation.

## Scope

In scope:

- Add an AI worker job contract for RAG retrieval, OCR recognition, and
  fine-tuning.
- Add an AI worker result contract that returns artifact references instead of
  direct database writes or inline private payloads.
- Require worker jobs to be owned by isolated Python workers.
- Require worker jobs to declare that baseline runtime dependencies are not
  allowed.
- Require worker jobs to declare that direct main database writes are not
  allowed.
- Gate examples for cloud public retrieval, local private retrieval, local OCR,
  and local fine-tuning.
- Add an executable audit to enforce node/data-access rules.
- Include the audit in the strict quality gate.

Out of scope:

- Installing Python model, OCR, RAG, training, or sandbox dependencies.
- Running actual OCR, RAG, model calls, or training jobs.
- Implementing a worker queue or scheduler.
- Persisting worker jobs in PostgreSQL.
- Adding vector indexes or embedding stores.
- Changing existing teaching, student, identity, workflow, or harness runtime
  behavior.

## Contracts

Schemas:

- `contracts/ai-worker/ai-worker-job.schema.json`
- `contracts/ai-worker/ai-worker-result.schema.json`

Examples:

- `contracts/ai-worker/ai-worker-job.examples.json`
- `contracts/ai-worker/ai-worker-result.example.json`

Tooling:

- `tools/ai-worker-job-audit.mjs`
- `tools/ai-worker-job-audit.test.mjs`
- `reports/ai-worker-job.current.json`

## Acceptance Criteria

- `node --test tools/ai-worker-job-audit.test.mjs` fails before the audit tool
  exists.
- AI worker job schema supports `RAG_RETRIEVAL`, `OCR_RECOGNITION`, and
  `FINE_TUNING`.
- AI worker jobs require `executionOwner=PYTHON_WORKER`.
- AI worker jobs require `baselineRuntimeDependencyAllowed=false`.
- AI worker jobs require `directMainDatabaseWriteAllowed=false`.
- AI worker result schema requires `directMainDatabaseWriteAttempted=false`.
- AI worker result artifacts require `privatePayloadInline=false`.
- The audit fails if cloud jobs request private knowledge or student archive
  data.
- The audit fails if the public cloud RAG example is missing.
- The audit fails if remote-device jobs request this machine's local private
  knowledge or student archive data.
- The audit passes current RAG/OCR/fine-tuning examples.
- `npm run audit:ai-worker-job` passes and writes
  `reports/ai-worker-job.current.json`.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Remove the AI worker job/result contracts, examples, audit tool, focused tests,
current report, package audit script, quality-gate entry, structure verifier
entries, and this SDD. Earlier P0-P6 gates remain unchanged.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused AI worker audit test result after implementation.
- `npm run audit:ai-worker-job` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
- confirmation that no Python worker dependency was installed.
