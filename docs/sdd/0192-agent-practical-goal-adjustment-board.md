# SDD 0192: Agent Practical Goal Adjustment Board

## Problem

The user provided a practical medical Agent project description and asked to
absorb the useful engineering ideas into the current Agent architecture board.
The project domains are different, so the refactor must not copy medical
features, training dependencies, or resume-style terminology into the product
baseline. The board needs a sharper goal statement and an explicit translation
matrix that keeps the useful Agent patterns while preserving the existing root
constraints.

## Source Requirement References

- The immutable root requirements remain the only product requirements source.
- The refactor is whole-system first; modules are delivery slices rather than
  isolated proofs of concept.
- Existing Agent architecture slices define Skills-Agent layering, Agent Loop,
  SwarmCoordinator, SharedContext, Memory Port, Harness guardrails, SDD/TDD,
  and strict quality gates.
- Heavy AI dependencies such as OCR, RAG/vector/embedding stores, Mem0, Milvus,
  vLLM, SFT/RL, FP8 quantization, and training workflows are optional worker or
  plugin capabilities, not baseline dependencies.
- Ultra-high concurrency claims still require full-system sustained mixed
  read/write evidence and Root SLO promotion gates.

## Scope

In scope:

- Update `architecture-board.html` with a goal-adjustment callout for the Agent
  module.
- Add a practical-project translation matrix that distinguishes borrowed
  engineering structure from forbidden domain copying.
- Tie each borrowed idea to contracts, permissions, evidence, rollback, SLOs,
  and quality gates.

Out of scope:

- Adding medical diagnosis, medication, clinical guideline, disease code, or
  medical VLM behavior.
- Installing or requiring OCR, vector stores, embeddings, Mem0, Milvus, vLLM,
  SFT/RL, FP8, or training dependencies in the baseline.
- Implementing runtime Agent execution code in this documentation slice.
- Changing root requirements, weakening quality gates, or claiming 10k RPS
  production readiness without full evidence.

## Contracts

The adjusted Agent target must preserve these baseline boundaries:

```text
RootRequirement -> AgentTask -> LeadAgentTriage -> AgentRouteDecision
  -> WorkerRoleManifest -> SkillManifest -> GuardrailResult
  -> Evidence -> FallbackDecision -> SLOReport
```

Borrowed practical-Agent patterns may only enter the baseline when they are
expressed through these education-specific control objects:

```text
domainCount, riskLevel, dataSensitivity, writeIntent, externalToolIntent,
memoryScope, selectedSkills, routeMode, budget, stopReason, rollbackPlan
```

Optional AI/model experiments must remain behind:

```text
AIWorkerAdmission, datasetScope, redactionState, resourceBudget,
evaluationReport, adapterRisk, defaultEnabled=false
```

## Acceptance Criteria

- The HTML board includes a concise Agent goal-adjustment statement.
- The board explains which practical Agent patterns are borrowed and which
  medical/model-training details remain out of baseline scope.
- The borrowed patterns are mapped to education-specific Agent roles, Skill
  families, memory boundaries, Harness controls, and evidence gates.
- `npm run verify:structure` and `git diff --check` pass.

## Rollback

Revert this SDD and the related `architecture-board.html` additions. Previous
Agent architecture board slices remain valid.
