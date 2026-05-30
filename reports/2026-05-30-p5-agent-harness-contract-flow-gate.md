# P5 Agent Harness Contract Flow Gate

## Slice

- SDD: `docs/sdd/0069-agent-harness-contract-flow-gate.md`
- Root requirement anchor: the coordinating assistant can control desktop applications, and mobile/social commands can ask the desktop assistant to act on the computer.
- Existing refactor evidence: SDD 0017 through SDD 0028 added permission, evidence, approval, queue, and disabled execution-candidate contracts.

## Contract

- Added `tools/agent-harness-flow-audit.mjs`.
- Added `tools/agent-harness-flow-audit.test.mjs`.
- Added `npm run audit:agent-harness-flow`.
- Added the Agent Harness flow audit to `npm run quality`.
- Added structure verification coverage for SDD 0069 and the new audit files.

The audit checks:

- Permission manifest schema version and default `DENY`.
- File, process, and browser dry-run rule surfaces.
- Audit evidence boundary fields and shared decision/action vocabulary.
- Approval artifacts remain `PENDING` review records.
- Approval decisions keep `executionReady=false`.
- Correlation flags `EXECUTION_READY_DECISION`.
- Queue snapshots keep `executionCandidateCount=0`.
- Execution candidate views expose no candidates and keep the future-SDD precondition.
- Rust source keeps approval decisions, approval queues, and execution-candidate projection review-only.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing file:

- `tools/agent-harness-flow-audit.mjs`

`node --test tools\agent-harness-flow-audit.test.mjs` failed before implementation with:

- `ERR_MODULE_NOT_FOUND` for `tools/agent-harness-flow-audit.mjs`

During implementation, the first current-flow test also failed because the audit input omitted `approval_decision.rs`; that was corrected by loading the Rust approval-decision source before checking `execution_ready: false`.

## Green Evidence

- `npm run verify:structure`: PASS
- `node --test tools\agent-harness-flow-audit.test.mjs`: PASS
- `node --test tools\quality-gate.test.mjs`: PASS
- `npm test`: PASS
- `npm run quality`: PASS, 13.7s
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/agent-harness-flow.current.json`:

- readiness: `READY`
- all manifest, evidence, approval, queue, execution-candidate, and Rust source findings: PASS

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `13680`
- npm test: PASS, 6662ms
- go vet: PASS, 1253ms
- cargo test: PASS, 800ms
- identity session runtime audit: PASS, 807ms
- identity access contract audit: PASS, 684ms
- student app flow audit: PASS, 710ms
- agent harness flow audit: PASS, 699ms
- direct-limited connection budget: PASS, 717ms
- pgbouncer connection budget: PASS, 714ms

## Design Notes

- This slice is an executable safety gate, not a real local execution feature.
- It intentionally keeps Agent Harness execution candidates disabled until a future SDD explicitly changes the contract.
- The gate protects against accidental changes that would turn approval records into executable local actions.
- No SQL table, package dependency, OCR/RAG/model, or training dependency was added.
