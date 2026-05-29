# SDD 0019: Agent Harness Dry-Run Adapters

## Problem

The Agent Harness now has a permission manifest and audit evidence records, but there is no single callable boundary that turns a requested file, process, or browser action into a dry-run report plus evidence. Later adapters must not call policy evaluation and evidence recording as separate ad hoc steps.

The root requirements eventually require local application control. Before real control exists, the Harness needs a dry-run facade that proves the full decision path without side effects.

## Source Requirement References

- Root requirement: the assistant can control desktop applications through the orchestrating agent.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0017: Agent Harness permission manifest decides allow, approval-required, or deny.
- SDD 0018: Agent Harness decisions become audit evidence.
- Roadmap P5: implement dry-run file/process adapters before real local control.

## Scope

In scope:

- Add a Rust `DryRunHarness` facade.
- Accept a principal, a harness request, an evidence ID, and a timestamp.
- Evaluate the permission manifest.
- Append audit evidence for every decision.
- Return a dry-run report that states whether the request would execute.
- Cover file, process, and browser action kinds through the shared request model.
- Tighten browser origin matching so lookalike origins are denied.

Out of scope:

- Real file writes or reads.
- Real process start.
- Real browser navigation.
- Durable evidence persistence.
- Human approval queue execution.

## Contracts

This slice uses the contracts already introduced by SDD 0017 and SDD 0018:

- `contracts/harness/permission-manifest.current.json`
- `contracts/harness/audit-evidence.schema.json`

Rust API:

- `DryRunHarness`
- `DryRunReport`

## Acceptance Criteria

- Rust tests prove allowed file dry-run records evidence and reports `wouldExecute=true`.
- Rust tests prove denied process dry-run records evidence and reports `wouldExecute=false`.
- Rust tests prove approval-required remote dry-run records evidence and reports `wouldExecute=false`.
- Rust tests prove lookalike browser origins are denied.
- Structure verification requires SDD 0019.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `DryRunHarness`, `DryRunReport`, and their tests. The lower-level permission evaluator and evidence types remain valid.

## Observability And Performance Evidence

Record:

- quality gate result.
- dry-run report behavior for allow, deny, and approval-required outcomes.
- future local adapter latency once real side-effect adapters exist behind the same facade.

