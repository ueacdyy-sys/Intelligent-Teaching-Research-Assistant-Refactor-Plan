# SDD 0182: Agent Skills Swarm Architecture Board

## Problem

The architecture board already treats Agent Harness as the safety boundary for
commands, tools, files, workflows, and plugins. The current Agent section is
still too coarse for a whole-system refactor: it says "agent" and "harness",
but it does not clearly separate reusable skills, domain worker agents,
lead/supervisor planning, swarm coordination, shared context, memory, and
guardrail enforcement.

A medical Agent project shows a useful engineering pattern: small atomic
skills, specialized worker agents, a lead agent, a swarm coordinator, shared
context, memory, and harness-style constraints. This refactor must absorb the
portable architecture idea without copying the medical domain, heavy model
training stack, or new runtime dependencies into the baseline.

## Source Requirement References

- Immutable root requirements: the system is a full teaching and research
  assistant with teaching, research, student, knowledge, model, computer
  operation, workflow, and plugin requirements.
- Whole-system refactor constraint: modules are execution slices, not isolated
  proofs of concept.
- Existing architecture-board.html: Agent Harness is the control plane for
  dangerous capabilities.
- Current performance objective: production read/write throughput must be
  proven by evidence before any 10k RPS claim.

## Scope

In scope:

- Update `architecture-board.html` so the Agent module uses a
  Skills-Agent two-layer architecture.
- Add LeadAgent, domain Worker Agents, SwarmCoordinator, SharedContext, memory
  ports, skill manifests, and invocation evidence to the architecture board.
- Keep Agent execution behind Harness policy, approval, evidence, rollback,
  budget, and entropy/loop guardrails.
- Keep optional heavy capabilities behind ports/plugins rather than baseline
  dependencies.

Out of scope:

- Adding new model, OCR, RAG, vector, embedding, training, Mem0, Milvus, vLLM,
  SFT, RL, or quantization dependencies in this slice.
- Claiming current production 10k RPS support.
- Implementing the Agent runtime code in this slice.
- Changing immutable root requirements.

## Contracts

The architecture board must describe these Agent contracts:

```text
Command -> LeadAgent -> SwarmCoordinator -> WorkerAgent/Skill -> HarnessPolicy
  -> Approval/Budget -> ToolAdapter/WorkerJob -> Evidence -> Reflection
```

Agent data contracts include:

```text
SkillManifest, AgentTask, AgentRun, SharedContext, MemoryEntry,
SkillInvocation, ToolRun, Evidence, Rollback
```

Baseline dependency policy:

```text
Memory, vector retrieval, multimodal inference, and model training are ports.
Specific products or heavy runtimes are optional adapters/plugins, not required
baseline dependencies.
```

## Acceptance Criteria

- The HTML board explains the Skills-Agent two-layer architecture in the Agent
  subsystem and Harness tab.
- The board maps teaching, research, diagnostic/analysis, workflow/plugin, and
  tool-control work to specialized Worker Agents.
- The board adds SharedContext, memory, skill invocation, swarm coordination,
  and guardrail objects to the data/API/permission/acceptance sections.
- The board explicitly keeps dangerous execution behind Harness and keeps heavy
  AI dependencies optional.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` pass.
- Docker has no residual running containers after verification.

## Rollback

Revert this SDD and the `architecture-board.html` updates. The architecture
board returns to the previous coarse Agent Harness description.
