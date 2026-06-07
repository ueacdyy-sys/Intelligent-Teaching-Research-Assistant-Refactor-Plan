# SDD 0243 - Research Deep Research Worker Lifecycle

## Problem

`ResearchAgent.deep_research` now has an admission-only runtime that submits a
reviewable async intent. That is not enough for the root research workflow:
the product requirement calls for research conversation, node orchestration,
multi-model collaboration, knowledge access policy, and fused answers. If the
next step jumps straight from "accepted intent" to RAG/model execution, the
system can bypass human review, local/private knowledge rules, worker lease
control, and safe failure evidence.

## Scope

Add a worker lifecycle control-plane slice for approved `deep_research` jobs.

This slice:

- accepts only `ACCEPTED_ASYNC` deep_research intent output
- requires explicit `APPROVED_FOR_ASYNC` human review evidence
- records a local `ASYNC_RESEARCH_WORKER` claim or failed-safe status through
  `DeepResearchWorkerCommandPort.recordDeepResearchWorkerLifecycle`
- stores an append-only JSONL command record with an idempotency key
- preserves source policy, execution plan, worker lease, approval, and evidence
  references
- blocks student archive access, remote-device sources, direct database writes,
  Swarm, publication, local tool mutation, and baseline AI runtime dependencies

This slice is worker lifecycle control plane only. It does not start RAG retrieval,
does not call models, does not execute multi-node fusion, does not generate a
final answer, and does not publish partial artifacts. Those remain a future
approved async execution slice after this lifecycle boundary is ready.

For audit clarity: this slice does not generate a final answer, and the next
runtime step is a future approved async execution slice.

## Contracts

- Input schema:
  `contracts/agent/deep-research-worker-lifecycle.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-worker-lifecycle.output.schema.json`
- Examples:
  `contracts/agent/deep-research-worker-lifecycle.input.example.json`
  and `contracts/agent/deep-research-worker-lifecycle.output.example.json`
- Runtime:
  `tools/research-deep-research-worker-lifecycle-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-worker-lifecycle-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-worker-lifecycle-audit.mjs`
- Audit tests:
  `tools/research-deep-research-worker-lifecycle-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The command log is append-only and defaults to
`reports/research-command-log/deep-research-worker-lifecycle.jsonl`. The
idempotency key prevents duplicate lifecycle records from turning into
multiple worker claims.

## Acceptance Criteria

- `node --test tools/research-deep-research-worker-lifecycle-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-worker-lifecycle-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-worker-lifecycle` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchWorkerLifecycle`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research worker lifecycle audit`.
- The architecture board states that `deep_research` has an async worker
  lifecycle boundary, while retrieval/model/fusion/final answer remain future
  approved async execution slices.

## Rollback

Remove the lifecycle schemas, examples, runtime, tests, audit, audit tests,
report, command log output, `package.json` audit script, strict quality entry,
root workflow coverage requirement, structure-verifier entries, and architecture
board text. Keep SDD 0242 intact because the admission-only intent runtime can
still stand without this worker lifecycle slice.
