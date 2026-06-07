# SDD 0224: Agent Read-Only Runtime Dispatcher

## Problem

The refactor now has three narrow read-only Agent fast paths:

- TeachingAgent `search_teaching_material`;
- StudentTutorAgent `recommend_practice`;
- ResearchAgent `search_knowledge`.

Keeping them as three separate evidence islands is not enough for a
whole-system refactor. The next step is a shared Agent Runtime entry that can
route these safe paths through one boundary, while still refusing writes,
direct database access, external model calls, local tool mutation, Swarm, deep
research, and final evaluation.

This slice must not restart broad production10k testing. Current system
performance evidence is already collected and supports the 10k/50ms gate. The
useful work now is to connect proven read-only Agent evidence into a reusable
runtime boundary.

## Scope

In scope:

- Add a read-only runtime dispatcher contract for the three current Agent fast
  paths.
- Require a single-worker allowlist: TeachingAgent, StudentTutorAgent, and
  ResearchAgent only.
- Aggregate component runtime SLO reports using `MAX_COMPONENT_P99`.
- Require zero aggregate errors and P99 less than or equal to 50ms.
- Require principal context, shared context, guardrail result, route evidence,
  invocation trace, input hash, output summary, adapter decision, source SLO,
  and runtime timing evidence.
- Attach dispatcher runtime evidence to root workflow coverage for
  `agent_harness_local_control`.
- Keep full Agent Loop, Swarm, model reasoning, RAG synthesis, deep research,
  and controlled write paths out of this claim.

Out of scope:

- Implementing the concrete runtime service or HTTP endpoint.
- Running model inference, OCR, RAG, vector search, training, or external
  tools.
- Adding write paths, workflow publishing, file/process/browser mutation, or
  local application control.
- Re-running broad production10k mixed workload benchmarks for this slice.

## Contracts

- `contracts/agent/readonly-runtime-dispatcher.schema.json` defines the shared
  dispatcher contract.
- `contracts/agent/readonly-runtime-dispatcher.example.json` allowlists the
  three current read-only fast paths.
- `tools/agent-readonly-runtime-dispatcher-audit.mjs` generates
  `reports/agent-readonly-runtime-dispatcher.current.json`.
- `tools/root-workflow-coverage-audit.mjs` attaches this dispatcher evidence
  to `agent_harness_local_control`.
- `tools/quality-gate.mjs` runs the dispatcher audit after the three component
  runtime SLO audits and before root workflow coverage.
- `tools/verify-structure.mjs` requires the dispatcher contracts and audit
  tool.

Current aggregate evidence:

- TeachingAgent P99: `11ms`, errors `0`;
- StudentTutorAgent P99: `11ms`, errors `0`;
- ResearchAgent P99 proxy: `2.55ms`, errors `0`;
- Dispatcher aggregate P99: `11ms`;
- Dispatcher aggregate errors: `0`;
- Boundary: no write intent, no direct database access, no external model
  call, no local tool mutation, no Swarm, no deep research, no final
  evaluation.

## Acceptance Criteria

- `npm run audit:agent-readonly-runtime-dispatcher` reports `READY`.
- The audit fails if any of the three component runtime SLO reports is missing,
  not ready, above 50ms P99, or has errors.
- The audit fails if a new adapter appears outside the allowlist.
- The audit fails if write intent, direct database access, external model
  calls, local tool mutation, Swarm, deep research, final evaluation, full
  Agent Loop claim, full Swarm claim, or model reasoning claim is enabled.
- Root workflow coverage counts Agent Harness as runtime-backed through this
  dispatcher evidence.
- The architecture board states that this is a shared read-only dispatcher, not
  full Agent product completion.

## Rollback

Remove the dispatcher schema/example, dispatcher audit tool and test, package
script, quality-gate entry, root workflow runtime evidence entry, structure
requirements, generated dispatcher report, and architecture board references.
Then regenerate root workflow coverage so Agent Harness returns to contract
and shared mixed-smoke coverage only.

## Observability And Performance Evidence

System-level performance remains:

- `22,435.1` read/write RPS;
- P99 `44.44ms`;
- `0` errors.

This dispatcher evidence is intentionally smaller: it proves that the current
read-only Agent entry can aggregate the three narrow fast paths under the
50ms gate. It does not prove 10ms production P99, long-soak ultra-high
concurrency, full Swarm, full RAG, OCR, model reasoning, or controlled write
readiness.
