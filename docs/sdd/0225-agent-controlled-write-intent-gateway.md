# SDD 0225: Agent Controlled Write Intent Gateway

## Problem

The Agent read-only dispatcher now gives the system a safe fast path for
TeachingAgent, StudentTutorAgent, and ResearchAgent. The next whole-system
risk is the opposite side: write-like Agent actions.

Teaching quiz drafts, teaching archive material drafts, workflow/plugin
drafts, AI grading, and local-tool operations are high-risk because a single
bad boundary can let an Agent mutate business data, publish workflows, write
final evaluations, or operate local applications without a human review trail.
That would break the root requirement for human-evaluable automation and would
also make later performance evidence meaningless because unsafe work would be
hidden behind fast responses.

## Scope

In scope:

- Add a shared controlled write-intent gateway contract.
- Allow only three review-only command intents in this slice:
  `draft_teaching_quiz`, `draft_archive_material`, and
  `draft_workflow_plugin`.
- Require principal context, SharedContext, guardrail result, route decision,
  human approval, rollback plan, idempotency key, command intent record,
  approval artifact reference, audit trace, and outbox event evidence.
- Keep Harness execution candidates disabled through the current
  `execution-candidate-view` contract.
- Make dangerous Skills remain Harness-gated, direct-DB-write denied, and
  rollback-evidenced.
- Attach the new contract report to root workflow coverage as Agent Harness
  controlled-write-intent evidence.

Out of scope:

- Executing business writes.
- Writing final AI grading or final student evaluation results.
- Publishing workflow/plugins.
- Mutating files, processes, browsers, or external applications.
- Running new broad production10k benchmarks for this contract-only slice.

## Contracts

- `contracts/agent/controlled-write-intent-gateway.schema.json` defines the
  review-only write-intent boundary.
- `contracts/agent/controlled-write-intent-gateway.example.json` allowlists
  the three accepted command intents.
- `tools/agent-controlled-write-intent-gateway-audit.mjs` generates
  `reports/agent-controlled-write-intent-gateway.current.json`.
- `tools/root-workflow-coverage-audit.mjs` requires this report for
  `agent_harness_local_control`.
- `tools/quality-gate.mjs` runs this audit before root workflow coverage.

This contract intentionally records command intent only. It does not claim that
Agent writes, final grading writes, workflow publication, or local tool
mutation are executable.

## Acceptance Criteria

- `npm run audit:agent-controlled-write-intent-gateway` reports `READY`.
- The audit fails if an unlisted write intent is exposed.
- The audit fails if any accepted intent can skip human approval.
- The audit fails if immediate business writes, direct database writes, final
  AI grading writes, workflow publish, model training writes, or local tool
  mutation are enabled.
- The audit fails if Harness execution candidates become non-empty.
- The audit fails if permission, guardrail, route, input hash, output summary,
  command intent, approval artifact, event envelope, rollback, idempotency, or
  audit trace evidence is not required.
- Root workflow coverage must not pass without this report.

## Rollback

Remove the controlled write-intent schema/example, audit tool/test, package
script, quality-gate entry, root workflow source report/check, generated
report, architecture board references, and this SDD. Then regenerate root
workflow coverage so Agent Harness returns to read-only runtime evidence plus
mixed-smoke coverage.

## Observability And Performance Evidence

This slice is contract and safety evidence, not a new throughput benchmark.

Current performance remains collected at the system level:

- `22,435.1` read/write RPS;
- P99 `44.44ms`;
- `0` errors.

The useful outcome of this SDD is not a higher RPS number. The useful outcome
is a safer architecture path: when the refactor later wires real Teaching draft
commands or AI grading requests, the write path already has approval,
idempotency, eventing, rollback, and audit evidence requirements instead of an
Agent direct-write shortcut.
