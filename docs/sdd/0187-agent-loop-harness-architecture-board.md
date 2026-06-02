# SDD 0187: Agent Loop Harness Architecture Board

## Problem

The architecture board already adopts a Skills-Agent model, but the user
provided a more concrete Agent project example with ReAct, Agent Loop,
specialized workers, swarm routing, shared memory, Harness Engineering, and
training/deployment topics. The refactor needs to absorb the useful engineering
patterns into the teaching and research assistant architecture without turning
the system into a medical Agent clone or adding heavy AI dependencies to the
baseline.

## Source Requirement References

- Immutable root requirements remain the real product requirements and must not
  be edited.
- Whole-system refactor constraint: modules are delivery slices of the whole
  system, not isolated proofs of concept.
- SDD 0182 and SDD 0185: Agent capabilities are organized as LeadAgent,
  Worker Agents, Skills, SwarmCoordinator, SharedContext, Memory Port, and
  Harness policy.
- SDD 0181 through SDD 0186: any high-concurrency claim requires whole-system
  sustained read/write evidence.

## Scope

In scope:

- Update `architecture-board.html` so the Agent module explains the runtime
  Agent Loop, not just static agent names.
- Map useful external Agent project ideas to teaching/research-specific
  implementation points.
- Add a student-facing worker role and richer atomic skills for teaching,
  tutoring, research, workflow, tool control, and system analysis.
- Keep routing, memory, tool use, failure handling, and evidence generation
  under Harness controls.

Out of scope:

- Adding medical diagnosis, medication, or clinical workflow behavior.
- Adding Milvus, Mem0, vLLM, SFT, RL, FP8 quantization, multimodal model
  training, or other heavy AI dependencies to the baseline.
- Implementing runtime Agent execution code in this slice.
- Weakening strict quality gates or changing root requirements.

## Contracts

Agent execution must remain explainable through:

```text
Command -> Triage -> AgentTask -> Plan -> SkillSelection
  -> GuardrailResult -> SkillInvocation/ToolRun -> Evidence
  -> Reflection -> Fallback/FinalAnswer
```

Routing must record:

```text
routeMode, domainCount, riskLevel, dataSensitivity, toolWriteIntent,
evidenceNeed, budget, workerAgents, fallbackPolicy
```

Each skill must still declare:

```text
summary, inputSchema, outputSchema, permissions, evidencePolicy,
costHint, disclosureLevel, timeout, retryLimit
```

## Acceptance Criteria

- The architecture board shows a concrete Agent Loop and maps borrowed Agent
  patterns to teaching/research implementation choices.
- The board includes a student tutoring worker role and more complete atomic
  Skills without expanding baseline runtime dependencies.
- Heavy AI/model training infrastructure is explicitly optional through
  adapters/plugins, not required for the core app.
- `npm run verify:structure`, focused tests, strict quality, and
  `git diff --check` remain passable.

## Rollback

Revert this SDD and the related `architecture-board.html` refinements. SDD 0182
and SDD 0185 remain the coarser Agent architecture baseline.
