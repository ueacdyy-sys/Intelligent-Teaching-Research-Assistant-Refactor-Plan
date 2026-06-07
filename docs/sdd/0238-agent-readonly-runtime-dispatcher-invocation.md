# SDD 0238: Agent Read-Only Runtime Dispatcher Invocation

## Problem

SDD 0224 created the shared read-only Agent Runtime Dispatcher contract and
aggregated three read-only fast-path SLO reports. SDD 0237 then implemented the
first real runtime adapter for `TeachingAgent.search_teaching_material`.

The dispatcher still needed one concrete runtime call path. Without that path,
the architecture could look connected while the actual runtime remained a set
of isolated reports.

This slice connects the dispatcher to the real TeachingAgent adapter without
claiming that StudentTutorAgent, ResearchAgent, Swarm, model reasoning, or the
full Agent Loop is complete.

## Scope

In scope:

- Add `tools/agent-readonly-runtime-dispatcher.mjs` as the pure runtime
  dispatcher entry for read-only Agent fast paths.
- Route only `TeachingAgent.search_teaching_material` to the real
  `invokeTeachingAgentSearchTeachingMaterial` adapter.
- Keep `StudentTutorAgent.recommend_practice` and
  `ResearchAgent.search_knowledge` as contract/SLO evidence only until their
  real adapters are implemented.
- Reject write intent, external model access, local tool mutation, Swarm,
  multi-worker route decisions, unknown workers, unknown skills, and student
  archive access before the read port is invoked.
- Wrap the TeachingAgent skill output with dispatcher evidence, input hash,
  adapter id, runtime timing, and read-only safety flags.
- Upgrade `tools/agent-readonly-runtime-dispatcher-audit.mjs` so the strict
  quality gate runs a real dispatch probe through the injected read port.

Out of scope:

- HTTP endpoints, background workers, or process-level service startup.
- Direct database access from the dispatcher.
- StudentTutorAgent or ResearchAgent real runtime adapter implementation.
- Swarm orchestration, deep research, RAG synthesis, model calls, OCR,
  training, local application control, or controlled writes.
- Re-running broad production10k mixed workload benchmarks.

## Contracts

- `tools/agent-readonly-runtime-dispatcher.mjs` exports
  `dispatchAgentReadonlyRuntime`.
- `tools/agent-readonly-runtime-dispatcher.test.mjs` covers the real
  TeachingAgent dispatch path and negative read-only boundary cases.
- `tools/agent-readonly-runtime-dispatcher-audit.mjs` now includes
  `runtime.implementation_invokes_teaching_adapter` and
  `runtime.implementation_boundary_scanned` findings.
- `reports/agent-readonly-runtime-dispatcher.current.json` records both the
  three-component aggregate read-only SLO and the real TeachingAgent dispatch
  probe.
- `tools/verify-structure.mjs` requires this SDD and the dispatcher runtime
  test files.

## Acceptance Criteria

- `node --test tools/agent-readonly-runtime-dispatcher.test.mjs
  tools/agent-readonly-runtime-dispatcher-audit.test.mjs` passes.
- `npm run audit:agent-readonly-runtime-dispatcher` reports `READY`.
- The dispatcher invokes `TeachingAgent.search_teaching_material` through the
  injected `TeachingArchiveReadPort.searchTeachingMaterials` path.
- The dispatcher rejects write intent, external model access, local tool
  mutation, Swarm, multi-worker routing, unknown routes, and StudentTutor or
  Research routes that are not yet wired to real adapters.
- The dispatcher report remains honest: it may claim a real TeachingAgent
  invocation, but it must not claim full Agent Loop, Swarm, StudentTutor real
  adapter, Research real adapter, model reasoning, or production 10ms P99.

## Rollback

Remove `tools/agent-readonly-runtime-dispatcher.mjs`,
`tools/agent-readonly-runtime-dispatcher.test.mjs`, the runtime probe findings
from `tools/agent-readonly-runtime-dispatcher-audit.mjs`, this SDD, and the
structure requirements. Then regenerate
`reports/agent-readonly-runtime-dispatcher.current.json` so it returns to
contract/SLO aggregation only.
