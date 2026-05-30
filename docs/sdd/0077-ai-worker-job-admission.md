# SDD 0077: AI Worker Job Admission

## Problem

SDD 0075 defines isolated AI worker jobs, and SDD 0076 defines the knowledge
access policy. The remaining dispatch gap is admission: a job can be well-formed
but still request data that its node type must not receive.

Without an explicit admission gate, a scheduler or queue could dispatch a cloud
worker job with private knowledge, a remote-device job with this machine's local
knowledge, or a job that makes OCR/RAG/training dependencies part of the
baseline runtime.

## Source Requirement References

- Root requirement: cloud nodes may access only public knowledge.
- Root requirement: local nodes may access public and private knowledge.
- Root requirement: remote-device nodes must not access this machine's
  knowledge base, but may use their own device knowledge.
- Root requirement: public and private knowledge bases must be physically
  isolated.
- SDD 0075: AI worker jobs must stay behind the isolated Python worker boundary
  and must not write directly to the main database.
- SDD 0076: knowledge access policy is the source of truth for node/data access.

## Scope

In scope:

- Add an AI worker job admission result contract.
- Add a current admission example.
- Add a pure admission function that evaluates worker jobs against the current
  knowledge access policy.
- Preserve `jobId`, `nodeType`, `capabilityKind`, decision reasons, and source
  policy version for every admission decision.
- Block jobs that allow baseline runtime dependencies.
- Block jobs that allow direct main database writes.
- Block cloud jobs that request private knowledge or student archive data.
- Block remote-device jobs that request this machine's local public, private, or
  student archive knowledge.
- Allow current valid AI worker job examples.
- Add an executable audit and include it in the strict quality gate.

Out of scope:

- Installing Python model, OCR, RAG, training, or sandbox dependencies.
- Implementing the worker queue, scheduler, or Python execution runtime.
- Running actual OCR, RAG, model calls, or training jobs.
- Persisting admission decisions in PostgreSQL.
- Adding vector indexes, embedding stores, or SQL tables.
- Changing existing teaching, student, identity, workflow, or harness runtime
  behavior.

## Contracts

Schema:

- `contracts/ai-worker/ai-worker-admission.schema.json`

Example:

- `contracts/ai-worker/ai-worker-admission.example.json`

Tooling:

- `tools/ai-worker-job-admission.mjs`
- `tools/ai-worker-job-admission.test.mjs`
- `reports/ai-worker-job-admission.current.json`

## Acceptance Criteria

- `node --test tools/ai-worker-job-admission.test.mjs` fails before the
  admission tool exists.
- Current valid AI worker examples are allowed for dispatch.
- Admission decisions preserve `jobId`, `nodeType`, `capabilityKind`, decision
  reasons, and the source knowledge policy version.
- Cloud jobs requesting private knowledge or student archive data are blocked.
- Remote-device jobs requesting this machine's local public, private, or student
  archive knowledge are blocked.
- Any job with `baselineRuntimeDependencyAllowed=true` is blocked.
- Any job with `directMainDatabaseWriteAllowed=true` is blocked.
- `npm run audit:ai-worker-job-admission` passes and writes
  `reports/ai-worker-job-admission.current.json`.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Remove the AI worker admission contract, example, admission tool, focused tests,
current report, package audit script, quality-gate entry, structure verifier
entries, and this SDD. Earlier P7 AI worker job and knowledge policy gates
remain unchanged.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused AI worker admission test result after implementation.
- `npm run audit:ai-worker-job-admission` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
- confirmation that no Python worker dependency was installed.
