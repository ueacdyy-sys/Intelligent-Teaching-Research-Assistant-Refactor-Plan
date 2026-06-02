# SDD 0188: Agent Practical Pattern Translation Board

## Problem

The user provided a practical medical Agent project description with ReAct,
Agent Loop, Skills-Agent layering, Agent Swarm, shared memory, Harness
Engineering, RAG, multimodal models, and optional training/deployment topics.
The architecture board already contains an Agent Harness section, but it should
make the translation from that practical pattern to the teaching and research
assistant more explicit so future AI-driven implementation does not copy the
medical domain or silently add heavy dependencies.

## Source Requirement References

- Immutable root requirements remain the authoritative product requirements and
  must not be edited.
- The refactor is whole-system first; modules are delivery slices rather than
  isolated proofs of concept.
- SDD 0182, SDD 0185, and SDD 0187 define the current Skills-Agent,
  SwarmCoordinator, SharedContext, Memory Port, and Harness architecture.
- Heavy AI/model dependencies are optional worker or plugin capabilities, not
  baseline runtime dependencies.
- Production concurrency claims still require full-system sustained read/write
  evidence and Root SLO promotion gates.

## Scope

In scope:

- Update `architecture-board.html` with an explicit teaching/research
  translation of useful practical Agent patterns.
- Show which ideas are adopted: triage, atomic skills, worker role registry,
  Agent Loop evidence, route policy, memory scope, Harness guardrails, and
  benchmark-backed acceptance.
- Separate the default baseline path from optional RAG, multimodal, training,
  vector database, Mem0, vLLM, SFT, RL, and quantization experiments.
- Strengthen the migration and acceptance language for single-Agent fast path,
  selective Swarm, workflow/plugin self-evolution, and tool control.

Out of scope:

- Adding medical diagnosis, medical advice, medication, clinical guideline, or
  disease coding features.
- Installing or requiring Milvus, Mem0, vLLM, SFT, RL, FP8, OCR, embedding, or
  training dependencies in the baseline.
- Implementing runtime Agent execution code in this slice.
- Changing root requirements, weakening quality gates, or claiming current
  10k RPS production readiness.

## Contracts

The adopted Agent pattern must remain explainable through these trace objects:

```text
Command -> LeadAgentTriage -> AgentTask -> AgentRouteDecision
  -> WorkerRoleManifest -> SkillManifest -> SkillInvocation
  -> GuardrailResult -> Evidence -> Reflection -> Fallback/FinalAnswer
```

Baseline Agent decisions must record:

```text
domainCount, riskLevel, dataSensitivity, writeIntent, externalToolIntent,
memoryScope, evidenceNeed, routeMode, workerAgents, budget, stopReason
```

Optional model or training capabilities must pass:

```text
AIWorkerAdmission, datasetScope, redactionState, resourceBudget,
evaluationReport, rollbackPlan
```

## Acceptance Criteria

- The architecture board distinguishes borrowed engineering patterns from
  borrowed domain behavior.
- The Agent section gives a concrete education-specific execution blueprint:
  triage, worker roles, skill families, memory, route policy, Harness execution,
  evidence, fallback, and benchmark acceptance.
- Optional multimodal/RAG/training infrastructure remains outside the baseline
  install and runtime path.
- Migration and acceptance sections make it clear that Swarm and plugin
  self-evolution are gated capabilities, not default behavior.
- `npm run verify:structure`, strict quality where practical, and
  `git diff --check` remain passable.

## Rollback

Revert this SDD and the corresponding `architecture-board.html` updates. SDD
0182, SDD 0185, and SDD 0187 remain the previous Agent architecture baseline.
