# P5 Agent Harness Execution Candidate View Evidence

Date: 2026-05-29

## Decision Summary

SDD 0028 adds a contract-tested execution candidate view derived from approval
queue snapshots. The view is intentionally empty in the current system:
`candidateCount=0` and `candidates=[]`.

This creates an explicit boundary for future real execution work. Approval
records and queue snapshots cannot become local actions unless a later SDD
changes the execution candidate contract and proves every required precondition.

## TDD Red Evidence

Before implementation, the new test target failed as expected:

```text
error[E0432]: unresolved import `agent_harness::ExecutionCandidateView`
```

This red test proved the execution candidate API did not exist before production
code was added.

## Targeted Test Evidence

Command:

```powershell
cargo test --manifest-path services/agent-harness/Cargo.toml --test execution_candidate_view
```

Result:

```text
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

Covered behavior:

- Matched queue snapshots still produce no execution candidates.
- Uncorrelated queue snapshots still produce no execution candidates and add a
  blocked precondition.
- Execution candidate views serialize to the contract shape.

## Strict Quality Gate

Command:

```powershell
npm run quality
```

Latest quality report:

- `allPassed=true`
- `elapsedMs=139225`
- `generatedAt=2026-05-29T04:46:00.297Z`

Passed checks:

- `npm test`
- `go vet`
- `cargo test`
- identity session runtime audit
- identity access contract audit
- direct-limited connection budget
- PgBouncer connection budget

## Architecture And Safety Review

- The view is a Rust domain projection over `ApprovalQueueSnapshot`.
- It does not import HTTP, database, process, browser, filesystem, or desktop
  automation adapters.
- It exposes only review traceability fields and an empty candidate list.
- Uncorrelated decisions add a blocked precondition.
- No local action is executed or made executable by this slice.

Clean Architecture score: 9/10.

To reach 10/10, a future execution design must introduce signed, expiring,
single-use execution intents with rollback evidence. That is intentionally out
of scope here.

## Rollback

Remove:

- `docs/sdd/0028-agent-harness-execution-candidate-view.md`
- `contracts/harness/execution-candidate-view.schema.json`
- `contracts/harness/execution-candidate-view.example.json`
- `services/agent-harness/src/execution_candidate.rs`
- `services/agent-harness/tests/execution_candidate_view.rs`
- SDD 0028 structure requirements and README references

Approval queue snapshots remain valid review records.

## Next Evidence

Next P5 slice should keep execution disabled and add signed intent planning
requirements as a specification-only SDD, or pivot to another whole-product
module while preserving the Harness safety boundary.
