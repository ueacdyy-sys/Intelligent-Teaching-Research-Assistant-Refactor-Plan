# SDD 0218: Agent Skill SharedContext Contract Gate

## Problem

The architecture board now includes LeadAgent, Worker Agents, Skills,
SharedContext, Swarm routing, memory, and Harness Engineering. Those concepts
must not remain presentation-only. The refactor needs a machine-checkable
contract gate before runtime Agent code is added, otherwise the system can
repeat the old pattern: an Agent appears to have broad capability while the
database, privacy, tool-control, and evidence boundaries are still implicit.

The next module slice should therefore create the Agent contract surface first:
Skill Manifest, SharedContext, AgentTask, RouteDecision, and GuardrailResult.
This keeps the whole-system refactor aligned with the immutable root
requirements while still allowing module-by-module delivery.

## Scope

In scope:

- Add `contracts/agent/*` JSON schemas and examples for:
  - Skill Manifest;
  - SharedContext;
  - AgentTask;
  - Agent RouteDecision;
  - GuardrailResult.
- Add `tools/agent-skill-contract-audit.mjs`.
- Add focused tests for the audit.
- Add the audit to npm scripts, strict quality command plan, structure
  verification, and root workflow coverage.
- Keep all Agent examples evidence-first, approval-aware, and direct database
  write denied.

Out of scope:

- Implementing a runtime Agent loop.
- Installing model, OCR, RAG, vector, embedding, training, Mem0, Milvus, vLLM,
  SFT/RL, quantization, or local GPU dependencies.
- Enabling generated workflow/plugin execution.
- Allowing Agent Skills to bypass Harness, human approval, or main database
  ports.
- Re-running broad performance matrices.

## Contracts

- `npm run audit:agent-skill-contracts` writes
  `reports/agent-skill-contracts.current.json`.
- Skill manifests must keep
  `directDatabaseWriteAllowed=false`.
- Dangerous or mutating permissions require `harnessRequired=true`.
- Skill examples cover Teaching, StudentTutor, Research, Analysis, Workflow,
  ToolControl, and ModelExperiment domains.
- SharedContext carries principal/session/data scopes, root anchors, evidence,
  redaction, token budget, latency budget, memory refs, and expiration policy.
- AgentTask exposes write intent, approval requirement, routing policy, and
  budget.
- RouteDecision supports both `SINGLE_WORKER` and `SWARM`; Swarm requires
  multiple workers, rationale, fallback, conflict policy, and P99 budget.
- GuardrailResult supports `ALLOW`, `APPROVAL_REQUIRED`, and `DENY`, while
  keeping direct database writes disabled.

## Acceptance Criteria

- Focused tests pass for the current Agent contract audit.
- Focused tests fail when a Skill can write directly to the main database.
- Focused tests fail when dangerous permissions bypass Harness.
- Focused tests fail when required Agent domains are missing.
- Focused tests fail when SharedContext loses root anchors or the 50ms latency
  budget.
- Focused tests fail when write-intent task examples do not show human
  approval.
- Focused tests fail when Swarm routing evidence is missing.
- Focused tests fail when guardrail deny coverage is missing.
- `npm run audit:agent-skill-contracts` reports `READY`.
- `npm run audit:root-workflow-coverage` consumes the Agent Skill contract
  report.
- `npm run verify:structure` passes.

## Rollback

Remove the `contracts/agent` schemas and examples, the Agent Skill contract
audit and focused tests, the npm script, quality-gate command-plan entry,
structure verifier entries, root workflow coverage source-report dependency,
generated report, and this SDD. Root workflow coverage should then return to
using only the older Agent Harness contract as Agent evidence.

## Observability And Performance Evidence

This is not new throughput evidence and must not be used to claim a higher RPS
ceiling. It is architecture and safety evidence: the report records covered
domains, route modes, guardrail decisions, direct database write status, and
which contract findings passed. The existing production10k evidence remains
the performance source of truth; this SDD only prevents future Agent runtime
work from weakening that boundary.
