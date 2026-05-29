# SDD 0028: Agent Harness Execution Candidate View

## Problem

Agent Harness can now read persisted approval queues and prove approval decision correlation, but there is still no explicit contract for the point where review evidence might later become execution candidates.

Without a locked execution-candidate view, future work could accidentally connect approval records directly to local action execution. The current system needs a contract-tested empty candidate view so that real execution can only be introduced by a later SDD that changes the contract and proves every precondition.

## Source Requirement References

- Root requirement: mobile social commands can ask the desktop assistant to control local applications.
- Root requirement: local application control must be routed through the coordinating assistant.
- SDD 0024: approval-required Harness decisions become pending approval artifacts.
- SDD 0025: approval decisions are durable review records with `executionReady=false`.
- SDD 0026: approval decisions must correlate to exactly one pending source artifact.
- SDD 0027: approval queue snapshots keep `executionCandidateCount=0`.
- Roadmap P5: Agent Harness requires permission, evidence, approval, and rollback model before real control.

## Scope

In scope:

- Add an execution candidate view JSON contract.
- Add a Rust execution candidate view derived from approval queue snapshots.
- Preserve source queue counts and generated time for review traceability.
- Keep `candidateCount=0`.
- Keep `candidates=[]`.
- Record blocked preconditions when queue decisions are uncorrelated.
- Record that local execution is disabled by SDD.

Out of scope:

- Real local action execution.
- Building executable commands.
- Consuming approvals.
- Updating approval or decision JSONL records.
- Process, file-write, browser, or desktop automation adapters.
- Human approval UI.

## Contracts

New contracts:

- `contracts/harness/execution-candidate-view.schema.json`
- `contracts/harness/execution-candidate-view.example.json`

Rust API:

- `ExecutionCandidate`
- `ExecutionCandidateView`

## Acceptance Criteria

- Rust tests prove matched approval queue snapshots still produce no execution candidates.
- Rust tests prove uncorrelated approval queue snapshots produce no execution candidates and include a blocked precondition.
- Rust tests prove execution candidate views serialize to the contract shape.
- Structure verification requires SDD 0028, execution candidate contracts, execution candidate module, and tests.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove `ExecutionCandidate`, `ExecutionCandidateView`, execution candidate view contracts, execution candidate tests, SDD 0028 structure checks, and README references. Approval queue snapshots remain valid review records.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Rust test result after implementation.
- strict quality gate result.
- confirmation that execution candidate views never execute local actions and currently expose no candidates.
