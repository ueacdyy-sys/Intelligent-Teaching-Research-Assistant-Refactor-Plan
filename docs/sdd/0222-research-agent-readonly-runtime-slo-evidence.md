# SDD 0222: ResearchAgent Read-Only Runtime SLO Evidence

## Problem

The refactor needs to keep moving by root-requirement workflows, not by
repeating broad performance tests that no longer change the current decision.
After TeachingAgent gained read-only runtime SLO evidence, the next low-risk
Agent slice is ResearchAgent knowledge retrieval.

ResearchAgent has two very different paths:

- `search_knowledge`: fast, read-only, cited retrieval planning for authorized
  public, private, and remote-owned knowledge sources.
- `deep_research`: slower research synthesis that may need multi-step planning,
  model calls, RAG, and async worker execution.

Only `search_knowledge` belongs in the current 50ms fast-path evidence. Forcing
`deep_research` into a 50ms claim would be dishonest and would blur the safety
boundary between retrieval and synthesis.

## Scope

In scope:

- Add ResearchAgent `search_knowledge` input and output contracts.
- Add a ResearchAgent read-only adapter contract bound to
  `KnowledgeQueryReadPort.searchKnowledge`.
- Require no direct database access, no write operation, no student archive
  return, no external model call, and no local tool mutation.
- Reuse the current knowledge retrieval benchmark query-plan evidence as a
  narrow runtime SLO proxy.
- Attach the ResearchAgent read-only runtime SLO to root workflow coverage.
- Keep the evidence class narrow and cheap so the refactor can continue into
  the next module.

Out of scope:

- Implementing full Agent Loop, Swarm, memory, or model synthesis.
- Claiming full RAG, OCR, multimodal, vector database, or training runtime
  performance.
- Claiming `deep_research` is a 50ms path.
- Re-running production10k mixed workload benchmarks for this slice.
- Adding heavy model or training dependencies to the baseline runtime.

## Contracts

- `contracts/agent/skills/search-knowledge.input.schema.json` defines the
  read-only input boundary.
- `contracts/agent/skills/search-knowledge.output.schema.json` defines cited,
  policy-safe retrieval output.
- `contracts/agent/research-agent-readonly-adapter.schema.json` binds the
  adapter to `KnowledgeQueryReadPort.searchKnowledge`.
- `tools/research-agent-readonly-contract-audit.mjs` generates
  `reports/research-agent-readonly-contract.current.json`.
- `tools/research-agent-readonly-runtime-slo-audit.mjs` generates
  `reports/research-agent-readonly-runtime-slo.current.json`.
- `tools/quality-gate.mjs` runs both ResearchAgent audits before root workflow
  coverage.
- `tools/root-workflow-coverage-audit.mjs` attaches this evidence to
  `research_conversation_and_fusion`.
- `tools/verify-structure.mjs` requires the ResearchAgent audit tools and
  contracts.

Current evidence:

- Contract report: `reports/research-agent-readonly-contract.current.json`;
- Runtime report: `reports/research-agent-readonly-runtime-slo.current.json`;
- Source report: `reports/knowledge-retrieval-benchmark.current.json`;
- Source phase: `knowledgeRetrievalQueryPlan`;
- Operations: `256`;
- P95/P99 proxy: `2.55ms / 2.55ms`;
- Errors: `0`;
- Boundary: no direct DB, no write, no student archive, no external model, no
  local tool mutation.

## Acceptance Criteria

- `npm run audit:research-agent-readonly-contract` reports `READY`.
- `npm run audit:research-agent-readonly-runtime-slo` reports `READY`.
- The runtime audit fails if the ResearchAgent contract report is not ready.
- The runtime audit fails if knowledge retrieval evidence is missing, has no
  operations, leaks forbidden classifications, or exceeds the 50ms P99 target.
- Root workflow coverage counts ResearchAgent as a runtime-backed workflow.
- The architecture board states that ResearchAgent read-only retrieval is a
  fast-path evidence slice, while full `deep_research` remains future async
  work.

## Rollback

Remove the ResearchAgent `search_knowledge` schemas, examples, adapter contract,
package scripts, audit tools, quality-gate entries, root workflow runtime
evidence entry, structure requirements, and generated reports. Then regenerate
root workflow coverage and update the architecture board back to ResearchAgent
contract-only or not-yet-covered status.

## Observability And Performance Evidence

This slice intentionally avoids another broad production10k run. The current
system-level performance evidence remains:

- `22,435.1` read/write RPS;
- P99 `44.44ms`;
- `0` errors.

The new ResearchAgent evidence is smaller: authorized knowledge retrieval
planning is within the 50ms fast-path budget with P99 proxy `2.55ms` over `256`
operations and zero errors. This supports continuing the refactor, but it still
does not prove full Agent Runtime, full RAG synthesis, full AI/OCR load, 10ms
production P99, or long-soak ultra-high-concurrency readiness.
