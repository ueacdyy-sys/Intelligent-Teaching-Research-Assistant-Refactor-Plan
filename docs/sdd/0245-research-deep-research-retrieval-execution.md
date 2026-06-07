# SDD 0245 - Research Deep Research Retrieval Execution

## Problem

`ResearchAgent.deep_research` can now submit an async intent, claim a local worker,
and record an approved retrieval plan. The next root-requirement gap is evidence
retrieval itself: the system must prove it can execute only the approved local
knowledge retrieval plan and return cited source evidence before any model
reasoning, answer fusion, or publication is allowed.

The risky shortcut is letting a worker bypass the plan, read arbitrary databases,
pull student archive data, call external models, or synthesize an answer while
claiming it is only retrieval. This slice draws that boundary explicitly.

## Scope

Add an approved retrieval-execution boundary for `deep_research`.

This slice:

- accepts only a `research_deep_research_retrieval_plan_runtime` output whose
  plan boundary has not already executed retrieval
- requires an internal service/admin principal with research and private
  knowledge read scope
- executes retrieval only through the injected
  `DeepResearchRetrievalReadPort.retrieveApprovedSources`
- records the result through
  `DeepResearchRetrievalExecutionPort.recordDeepResearchRetrievalExecution`
- requires every returned chunk to include plan item id, knowledge base ref,
  classification, source kind, citation, source hash, source ref, and local-only
  evidence
- enforces the approved plan budget for chunks and source refs
- blocks direct database access, writes, student archive data, remote-device
  sources, external model calls, RAG synthesis, answer fusion, Swarm, local tool
  mutation, publication, and final answers

This is retrieval execution only. It can return cited source evidence, but it
does not rank final claims, does not call models, does not fuse answers, does
not generate a final answer, does not publish a research note, and does not
update the main database. Those remain future async reasoning and synthesis
slices.

## Contracts

- Input schema:
  `contracts/agent/deep-research-retrieval-execution.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-retrieval-execution.output.schema.json`
- Examples:
  `contracts/agent/deep-research-retrieval-execution.input.example.json`
  and `contracts/agent/deep-research-retrieval-execution.output.example.json`
- Runtime:
  `tools/research-deep-research-retrieval-execution-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-retrieval-execution-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-retrieval-execution-audit.mjs`
- Audit tests:
  `tools/research-deep-research-retrieval-execution-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-retrieval-execution.jsonl`. The
idempotency key prevents duplicate retrieval-result records for the same
approved plan execution.

## Acceptance Criteria

- `node --test tools/research-deep-research-retrieval-execution-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-retrieval-execution-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-retrieval-execution` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchRetrievalExecution`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research retrieval execution audit`.
- The architecture board states that `deep_research` has approved retrieval
  execution evidence while model reasoning, answer fusion, and final answer
  generation remain future async slices.

## Rollback

Remove the retrieval-execution schemas, examples, runtime, tests, audit, audit
tests, report, command log output, `package.json` audit script, strict quality
entry, root workflow coverage requirement, structure-verifier entries, and
architecture board text. Keep SDD 0242, SDD 0243, and SDD 0244 intact because
intent admission, worker lifecycle, and retrieval planning remain valid without
retrieval execution.
