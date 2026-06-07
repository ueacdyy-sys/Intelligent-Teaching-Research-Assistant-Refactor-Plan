# SDD 0237: TeachingAgent Read-Only Runtime Adapter

## Problem

SDD 0220 defined the `TeachingAgent.search_teaching_material` adapter contract,
and SDD 0221 added read-phase SLO evidence from the Teaching Archive gateway.
That still left the Agent layer mostly contract-only: no real runtime function
validated PrincipalContext, SharedContext, GuardrailResult, RouteDecision, and
the injected read port together before producing a Skill output.

The root requirements make teaching materials, quiz drafting, AI grading, and
student archive boundaries a core path. The next safe step is therefore a real
read-only adapter for teaching material search, not another broad production10k
rerun.

## Scope

In scope:

- Add `tools/teaching-agent-readonly-runtime-adapter.mjs`.
- Invoke only the injected
  `TeachingArchiveReadPort.searchTeachingMaterials` operation.
- Validate the Skill input, principal, SharedContext, GuardrailResult, and
  single-worker RouteDecision before the read port is called.
- Map read-port rows into the checked
  `search-teaching-material.output.schema.json` shape.
- Emit input-hash, adapter, read-port, source, and runtime timing evidence refs.
- Reject write intent, student archive access, private knowledge scope, local
  tool mutation, external model requests, Swarm routes, wrong worker/skill, and
  unsafe read-port rows.
- Add focused runtime tests, an audit report, strict quality-gate registration,
  structure verification, and root workflow coverage.

Out of scope:

- Full Agent Loop orchestration.
- Swarm coordination.
- External model calls or model training dependencies.
- Direct database access, SQL, file writes, process launch, or HTTP fetch from
  the adapter.
- Saving quiz drafts, final ArchiveItem records, AI grading results, or student
  profile updates.
- A new production10k benchmark run.

## Runtime Contract

The adapter exports:

- `invokeTeachingAgentSearchTeachingMaterial(input, deps, options)`;
- `TEACHING_AGENT_READONLY_RUNTIME_ADAPTER_ID`;
- `TEACHING_AGENT_READONLY_RUNTIME_READ_PORT`;
- `TEACHING_AGENT_READONLY_RUNTIME_READY`.

The adapter requires `deps.readPort.searchTeachingMaterials` and never imports
database, HTTP, file, process, or model clients. The only runtime dependency is
Node's `crypto` module for a deterministic input hash.

Accepted context is intentionally narrower than a teacher's full permission set:

- principal must have `TEACHING_READ` or `ADMIN_SYSTEM`;
- principal cannot be `STUDENT`, `REMOTE_OPERATOR`, or `REMOTE_CHANNEL`;
- SharedContext must have `teaching=READ`, `student=NONE`,
  `knowledge=PUBLIC`, and `tool=NONE`;
- GuardrailResult must be `ALLOW`, evidence-required, direct-DB-write false,
  and all safety checks must pass;
- RouteDecision must be `SINGLE_WORKER`, `TeachingAgent`, and
  `search_teaching_material`.

## Contracts

This slice depends on the existing checked contracts:

- `contracts/agent/teaching-agent-readonly-adapter.schema.json`
- `contracts/agent/teaching-agent-readonly-adapter.example.json`
- `contracts/agent/skills/search-teaching-material.input.schema.json`
- `contracts/agent/skills/search-teaching-material.output.schema.json`
- `contracts/agent/shared-context.schema.json`
- `contracts/agent/guardrail-result.schema.json`
- `contracts/agent/agent-route-decision.schema.json`

It adds runtime code and audit evidence, but does not change the input/output
schema vocabulary. The Skill output still marks promotion evidence as required
before broader Agent claims are allowed.

## Evidence

New evidence files:

- `tools/teaching-agent-readonly-runtime-adapter.test.mjs`
- `tools/teaching-agent-readonly-runtime-adapter-audit.mjs`
- `tools/teaching-agent-readonly-runtime-adapter-audit.test.mjs`
- `reports/teaching-agent-readonly-runtime-adapter.current.json`

The audit checks:

- adapter identity and read-port binding;
- input/output safety boundaries;
- runtime guard symbols and injected read port;
- absence of file writes, process launch, fetch, direct SQL, direct DB, model
  calls, student data, and private knowledge;
- runtime probe output through the injected read port;
- negative-path runtime test coverage;
- package script, quality-gate, structure verifier, and root workflow coverage.

## Acceptance Criteria

- Focused runtime and audit tests pass.
- `npm run audit:teaching-agent-readonly-runtime-adapter` reports `READY`.
- `npm run verify:structure` requires the new runtime, tests, audit, and SDD.
- `npm run audit:root-workflow-coverage` requires
  `reports/teaching-agent-readonly-runtime-adapter.current.json`.
- The strict quality gate includes `TeachingAgent read-only runtime adapter
  audit`.
- No broad production10k rerun is required for this control-plane/read-only
  slice.

## Rollback

Remove the runtime, tests, audit, report, and this SDD. Then remove the package
script, quality-gate command, verify-structure entries, and root workflow
coverage requirements for `teachingAgentReadonlyRuntimeAdapter`. SDD 0220 and
SDD 0221 still remain as contract and SLO evidence, but the TeachingAgent path
returns to contract-only runtime status.

## Performance Note

This slice adds a small injected-read-port runtime probe. The whole-system
performance baseline remains the existing production10k evidence and root SLO
review. The current supported standard is 10k RPS under 50ms-class root SLO
evidence; production 10ms remains an aspirational upper bar, not a current
claim.
