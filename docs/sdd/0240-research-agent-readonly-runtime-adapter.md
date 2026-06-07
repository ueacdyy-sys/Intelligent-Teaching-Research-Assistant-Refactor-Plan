# SDD 0240 - ResearchAgent Read-Only Runtime Adapter

## Problem

The root research workflow needs a real, policy-scoped retrieval path for
`ResearchAgent.search_knowledge`. Before this slice, ResearchAgent had safe
contracts and a small runtime SLO proxy from the knowledge retrieval benchmark,
but the shared read-only dispatcher could not invoke a real Research adapter.
That left the research conversation workflow weaker than TeachingAgent and
StudentTutorAgent and made the architecture board depend on contract-level
evidence for one of the three read-only Agent fast paths.

## Scope

Add a real read-only runtime adapter for `ResearchAgent.search_knowledge` and
wire it into the shared Agent read-only runtime dispatcher.

The adapter only calls an injected `KnowledgeQueryReadPort.searchKnowledge`.
It validates `PrincipalContext`, `SharedContext`, `GuardrailResult`,
`RouteDecision`, skill input, and read-port rows before returning cited
knowledge items.

This slice does not implement `deep_research`, RAG synthesis, model reasoning,
student archive access, final answers, direct database access, local tool
mutation, Swarm orchestration, HTTP API exposure, or broad production10k
retesting.

## Contracts

- Skill input: `contracts/agent/skills/search-knowledge.input.schema.json`
- Skill output: `contracts/agent/skills/search-knowledge.output.schema.json`
- Adapter contract: `contracts/agent/research-agent-readonly-adapter.schema.json`
- Runtime adapter: `tools/research-agent-readonly-runtime-adapter.mjs`
- Runtime audit: `tools/research-agent-readonly-runtime-adapter-audit.mjs`
- Dispatcher: `tools/agent-readonly-runtime-dispatcher.mjs`
- Root workflow coverage: `tools/root-workflow-coverage-audit.mjs`

The adapter accepts only single-worker `ResearchAgent.search_knowledge`
routes. It requires research and knowledge read scopes, denies student
principals and remote social principals, rejects write intent, student archive
requests, external model access, synthesis, unsafe SharedContext scopes,
denied guardrails, wrong route decisions, missing read ports, unsafe rows,
out-of-policy classifications, local tool mutation, and direct database/write
claims.

## Acceptance Criteria

- `node --test tools/research-agent-readonly-runtime-adapter.test.mjs` passes.
- `node --test tools/research-agent-readonly-runtime-adapter-audit.test.mjs`
  passes.
- `node --test tools/agent-readonly-runtime-dispatcher.test.mjs
  tools/agent-readonly-runtime-dispatcher-audit.test.mjs` passes with
  TeachingAgent, StudentTutorAgent, and ResearchAgent real dispatch probes.
- `npm run audit:research-agent-readonly-runtime-adapter` reports `READY`.
- `npm run audit:agent-readonly-runtime-dispatcher` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchAgentReadonlyRuntimeAdapter`.
- `npm run verify:structure` requires this SDD, runtime adapter, tests, audit,
  and audit tests.
- Strict quality includes `ResearchAgent read-only runtime adapter audit`.

## Rollback

Remove `tools/research-agent-readonly-runtime-adapter.mjs`, its tests and
audit files, remove `audit:research-agent-readonly-runtime-adapter` from
`package.json` and strict quality, remove the Research real adapter
requirement from root workflow coverage, revert dispatcher wiring for
`ResearchAgent.search_knowledge` back to contract-only, remove this SDD from
`tools/verify-structure.mjs`, and delete
`reports/research-agent-readonly-runtime-adapter.current.json`.
