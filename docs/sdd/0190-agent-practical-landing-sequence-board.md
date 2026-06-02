# SDD 0190: Agent Practical Landing Sequence Board

## Problem

The architecture board already translates practical Agent project patterns into
the teaching and research assistant domain. The user asked to absorb the useful
parts of a practical medical Agent project while preserving the current system
constraints. The missing piece is an explicit landing sequence that keeps the
Agent module implementable, reviewable, and benchmark-backed instead of turning
the board into a list of impressive terms.

## Source Requirement References

- The immutable root requirements remain the real product requirements.
- This is a whole-system refactor; modules are delivery slices, not isolated
  proofs of concept.
- SDD 0182, SDD 0185, SDD 0187, and SDD 0188 define the current
  Skills-Agent, Agent Loop, SwarmCoordinator, SharedContext, Memory Port, and
  Harness architecture.
- Heavy AI dependencies such as OCR, vector stores, embeddings, Mem0, Milvus,
  vLLM, SFT, RL, and quantization are optional worker or plugin capabilities,
  not baseline dependencies.
- High-concurrency and ultra-concurrency claims still require full-system
  sustained mixed read/write evidence and Root SLO promotion gates.

## Scope

In scope:

- Update `architecture-board.html` with a concise explanation of what is being
  borrowed from practical Agent projects.
- Add a landing sequence for Agent implementation: contracts, single-Agent
  read path, controlled writes, selective Swarm, and optional experimental
  workers.
- Keep the Agent architecture tied to testable contracts, Harness evidence,
  route decisions, and performance SLO evidence.

Out of scope:

- Adding medical diagnosis, clinical workflow, medication advice, or disease
  coding features.
- Installing or requiring training, OCR, vector, embedding, Mem0, Milvus,
  vLLM, SFT, RL, or quantization dependencies in the baseline.
- Implementing runtime Agent execution code in this documentation slice.
- Changing root requirements or weakening strict quality gates.

## Contracts

The implementation order must preserve these boundary objects:

```text
AgentTask -> WorkerRoleManifest -> SkillManifest -> SharedContext
  -> GuardrailResult -> Evidence -> FallbackDecision
```

Runtime promotion must be backed by:

```text
RouteDecision, PermissionTrace, EvidencePack, SLOReport, RollbackPlan
```

Optional model experiments must remain behind:

```text
AIWorkerAdmission, datasetScope, redactionState, resourceBudget,
evaluationReport, rollbackPlan
```

## Acceptance Criteria

- The HTML board explains that practical Agent ideas are borrowed as an
  engineering skeleton, not copied as medical domain behavior.
- The Agent section names the landing sequence and its minimum evidence.
- Single-Agent read paths are separated from controlled writes, selective
  Swarm, and optional model experiments.
- The baseline remains free of heavy training, OCR, vector, embedding, Mem0,
  Milvus, vLLM, SFT, RL, and quantization dependencies.
- `npm run verify:structure` and `git diff --check` pass.

## Rollback

Revert this SDD and the related `architecture-board.html` additions. SDD 0188
remains the previous practical Agent pattern translation record.
