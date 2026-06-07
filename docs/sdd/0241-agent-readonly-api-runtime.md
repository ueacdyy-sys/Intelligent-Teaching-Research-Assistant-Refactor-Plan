# SDD 0241 - Agent Read-Only API Runtime

## Problem

The root Agent Harness workflow now has three real read-only runtime adapter
paths behind the shared dispatcher:
`TeachingAgent.search_teaching_material`,
`StudentTutorAgent.recommend_practice`, and
`ResearchAgent.search_knowledge`.

The remaining gap is the product-facing entry point. A caller should not invoke
the dispatcher with a loose bundle of fields. It should submit an `AgentTask`,
`PrincipalContext`, `SharedContext`, `GuardrailResult`, `RouteDecision`, and
skill input, then have one API runtime enforce the read-only control-plane
rules before any read port is called.

## Scope

Add `tools/agent-readonly-api-runtime.mjs` as a narrow read-only API runtime
wrapper over `dispatchAgentReadonlyRuntime`.

This runtime supports only three low-risk or medium-risk single-worker task
kinds:

- `TEACHING` -> `TeachingAgent.search_teaching_material`
- `STUDENT_TUTORING` -> `StudentTutorAgent.recommend_practice`
- `RESEARCH` -> `ResearchAgent.search_knowledge`

It validates the task, principal, shared context, guardrail, route decision,
skill input, and evidence references before dispatch. It rejects write intent,
human approval requirements, Swarm triggers, unsupported task kinds, high-risk
tasks, external model calls, local tool mutation, route mismatches, unsafe
guardrails, `deep_research`, final evaluation, and synthesis requests.

This slice does not implement full Agent Loop, Swarm, write execution, final
quiz creation, final archive item creation, final AI grading, RAG synthesis,
`deep_research`, model reasoning, direct database access, HTTP delivery, or
broad production10k retesting.

## Contracts

- Runtime API: `tools/agent-readonly-api-runtime.mjs`
- Runtime tests: `tools/agent-readonly-api-runtime.test.mjs`
- Runtime audit: `tools/agent-readonly-api-runtime-audit.mjs`
- Dispatcher source: `tools/agent-readonly-runtime-dispatcher.mjs`
- Dispatcher evidence: `reports/agent-readonly-runtime-dispatcher.current.json`
- Root workflow coverage: `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate: `tools/quality-gate.mjs`

The runtime is a control-plane adapter. It may delegate to the dispatcher but
must not import skill adapters directly, use filesystem or process side
effects, call external networks or models, or access SQL or direct database
clients.

## Acceptance Criteria

- `node --test tools/agent-readonly-api-runtime.test.mjs` passes.
- `node --test tools/agent-readonly-api-runtime-audit.test.mjs` passes.
- `npm run audit:agent-readonly-api-runtime` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `agentReadonlyApiRuntime`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes `Agent read-only API runtime audit`.
- The architecture board states that the product-facing read-only Agent API
  runtime is ready, while full Agent Loop, Swarm, deep research, RAG synthesis,
  and write execution remain future slices.

## Rollback

Remove `tools/agent-readonly-api-runtime.mjs`, its tests and audit files, remove
`audit:agent-readonly-api-runtime` from `package.json` and strict quality,
remove `agentReadonlyApiRuntime` from root workflow coverage, remove this SDD
from structure verification, delete
`reports/agent-readonly-api-runtime.current.json`, and revert the architecture
board status text to dispatcher-only evidence.
