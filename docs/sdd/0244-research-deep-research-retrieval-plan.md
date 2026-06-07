# SDD 0244 - Research Deep Research Retrieval Plan

## Problem

`ResearchAgent.deep_research` can now submit a reviewable async intent and record
an approved local worker lifecycle claim. The next risk is jumping directly from
the worker claim into RAG retrieval or model synthesis. The immutable root
requirements need public/private knowledge isolation, node policy, citation
evidence, and efficient RAG. They do not allow private knowledge, student
archives, remote-device sources, model calls, or final answer generation to leak
through an unreviewed shortcut.

## Scope

Add an approved retrieval-plan control-plane slice for claimed `deep_research`
jobs.

This slice:

- accepts only a claimed `research_deep_research_worker_lifecycle_runtime`
  output
- requires an internal service/admin principal with research and private
  knowledge scope
- records a directory-index-first retrieval plan through
  `DeepResearchRetrievalPlanPort.recordDeepResearchRetrievalPlan`
- preserves source classification, knowledge base refs, planned queries,
  directory scopes, citation requirements, source-hash requirements, and
  retrieval budgets
- validates that every planned source stays inside the approved public/private
  source policy
- blocks student archive access, remote-device sources, direct database access,
  immediate vector search, RAG execution, model calls, Swarm, local tool
  mutation, publication, and final answers

This is planning control plane only. It does not read the directory index, does
not retrieve chunks, does not call models, and does not publish. For audit
clarity: this slice does not run vector search, does not fuse answers, does not
generate a final answer, and does not execute retrieval. Those remain future approved async execution
slices and future synthesis slices.

## Contracts

- Input schema:
  `contracts/agent/deep-research-retrieval-plan.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-retrieval-plan.output.schema.json`
- Examples:
  `contracts/agent/deep-research-retrieval-plan.input.example.json`
  and `contracts/agent/deep-research-retrieval-plan.output.example.json`
- Runtime:
  `tools/research-deep-research-retrieval-plan-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-retrieval-plan-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-retrieval-plan-audit.mjs`
- Audit tests:
  `tools/research-deep-research-retrieval-plan-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The command log is append-only and defaults to
`reports/research-command-log/deep-research-retrieval-plan.jsonl`. The
idempotency key prevents duplicate plan records from creating multiple future
retrieval executions.

## Acceptance Criteria

- `node --test tools/research-deep-research-retrieval-plan-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-retrieval-plan-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-retrieval-plan` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchRetrievalPlan`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research retrieval plan audit`.
- The architecture board states that `deep_research` has approved retrieval
  planning evidence while actual retrieval, model reasoning, fusion, and final
  answer remain future async slices.

## Rollback

Remove the retrieval-plan schemas, examples, runtime, tests, audit, audit tests,
report, command log output, `package.json` audit script, strict quality entry,
root workflow coverage requirement, structure-verifier entries, and architecture
board text. Keep SDD 0242 and SDD 0243 intact because intent admission and
worker lifecycle can stand without retrieval planning.
