# SDD 0185: Agent Skills Operationalization Board

## Problem

SDD 0182 moved the architecture board from a coarse "agent" label to a
Skills-Agent model with LeadAgent, Worker Agents, SwarmCoordinator,
SharedContext, memory ports, and Harness guardrails. The board still needs a
more operational explanation of how those ideas become a teaching and research
assistant rather than a generic or medical Agent demo.

A medical Agent project provides useful practical patterns: atomic skills,
specialized workers, a lead agent, swarm routing, shared context, memory, loop
limits, and Harness-style constraints. This refactor should borrow the
engineering pattern, not the medical domain or the heavy model-training stack.

## Source Requirement References

- Immutable root requirements: the system remains a whole teaching and research
  assistant with teaching, research, student, knowledge, workflow, plugin, and
  local-computer-operation requirements.
- Whole-system refactor constraint: modules are delivery slices, not isolated
  proofs of concept.
- SDD 0182: Agent module uses Skills-Agent, SwarmCoordinator, SharedContext,
  SkillManifest, Memory Port, and Harness policy.
- SDD 0181 through SDD 0184: production read/write throughput claims require
  sustained whole-system evidence.

## Scope

In scope:

- Update `architecture-board.html` with a teaching/research-specific atomic
  Skill catalog.
- Rename the generic diagnostic worker to `AnalysisAgent`, covering learning
  analytics, system diagnostics, performance attribution, and remediation
  proposals.
- Add single-Agent versus Swarm routing scenarios, fallback policy, guardrail
  results, progressive Skill disclosure, and loop/entropy controls.
- Keep dangerous execution behind Harness policy, approval, evidence,
  rollback, budgets, and human review points.

Out of scope:

- Adding medical-domain behavior, diagnosis claims, medication advice, or any
  medical assistant feature.
- Adding model, OCR, RAG, vector, embedding, Mem0, Milvus, vLLM, SFT, RL,
  quantization, or training dependencies to the baseline.
- Implementing runtime Agent code in this slice.
- Changing immutable root requirements or claiming current 10k RPS production
  support.

## Contracts

Agent execution must stay explainable through these trace objects:

```text
Command -> AgentTask -> AgentRouteDecision -> SharedContext
  -> SkillManifest -> SkillInvocation -> GuardrailResult
  -> ToolRun/WorkerJob -> Evidence -> Fallback/Reflection
```

Baseline agent capabilities are product-shaped skills:

```text
search_teaching_material, assess_learning_risk, search_knowledge,
deep_research, draft_workflow, run_tool
```

Each skill must declare:

```text
summary, inputSchema, outputSchema, requiredPermissions, costHint,
evidencePolicy, disclosureLevel
```

## Acceptance Criteria

- The architecture board shows operational Skills-Agent controls, not only
  high-level agent names.
- Worker Agent names and responsibilities fit the teaching/research domain.
- The board explains when to use a single Worker Agent and when to use Swarm.
- Failure handling includes retry limits, fallback modes, human review points,
  and no infinite loops.
- Heavy AI infrastructure remains optional behind ports or plugins.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` pass.

## Rollback

Revert this SDD and the `architecture-board.html` additions for skill catalog,
routing scenarios, fallback policy, progressive disclosure, and AnalysisAgent.
SDD 0182 remains as the coarser Skills-Agent architecture baseline.
