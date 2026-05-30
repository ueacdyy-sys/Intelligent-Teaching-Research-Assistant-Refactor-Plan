# SDD 0069: Agent Harness Contract Flow Gate

## Problem

The root requirement allows the coordinating assistant to control desktop
applications, and remote or social commands can ask the desktop assistant to act
on the computer. SDD 0017 through SDD 0028 already added the Agent Harness
permission manifest, dry-run evidence, approval artifacts, approval decisions,
correlation, queue snapshots, and execution-candidate view. However, those
pieces are not yet protected by one executable flow gate.

Without a single gate, a later vibecoding slice could accidentally relax the
manifest default decision, let approval decisions become execution-ready, remove
the execution-disabled candidate view, or bypass the review-only queue while
individual Rust unit tests still pass.

## Source Requirement References

- Root requirement: the orchestrating assistant can call sub-agents and control
  external applications.
- Root requirement: mobile social commands can ask the desktop assistant to act
  on the computer.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0017 through SDD 0028: Agent Harness permission, evidence, approval, queue,
  and disabled execution-candidate contracts.
- Whole system module map: P5 Agent Harness requires permission, evidence,
  approval flow, and rollback model before real local control.

## Scope

In scope:

- Add an executable Agent Harness contract flow audit.
- Verify the current permission manifest defaults to `DENY`.
- Verify file, process, and browser dry-run rule surfaces still exist.
- Verify audit evidence keeps the shared decision vocabulary.
- Verify approval artifacts remain pending review records.
- Verify approval decisions keep `executionReady=false`.
- Verify approval decision correlation flags execution-ready decisions.
- Verify approval queue snapshots keep `executionCandidateCount=0`.
- Verify execution candidate views expose no candidates and keep the explicit
  future-SDD precondition.
- Verify Rust source keeps execution candidates disabled rather than producing
  executable local actions.
- Add the audit to the strict quality gate.

Out of scope:

- Real local file, process, browser, or desktop automation execution.
- Human approval UI.
- Changing Harness Rust behavior.
- Adding dependencies.
- Starting Docker or live services.

## Contracts

New tooling:

- `tools/agent-harness-flow-audit.mjs`
- `tools/agent-harness-flow-audit.test.mjs`
- `reports/agent-harness-flow.current.json`

Updated gates:

- `package.json`
- `tools/quality-gate.mjs`
- `tools/verify-structure.mjs`

## Acceptance Criteria

- `node --test tools/agent-harness-flow-audit.test.mjs` passes.
- The audit fails when `permission-manifest.current.json` no longer defaults to
  `DENY`.
- The audit fails when approval decisions can set `executionReady=true`.
- The audit fails when execution candidate views can expose candidate items.
- The audit fails when the Rust execution-candidate projection stops hardcoding
  empty candidates.
- `npm run quality` runs the Agent Harness flow audit and writes
  `reports/agent-harness-flow.current.json`.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Remove SDD 0069, the Agent Harness flow audit tool and tests, the package script,
the quality-gate command entry, the generated current report, and the structure
verifier entries. Existing Harness contracts and Rust behavior remain unchanged.

## Observability And Performance Evidence

Record:

- failing structure and tool-test evidence before implementation.
- `node --test tools/agent-harness-flow-audit.test.mjs` after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json`
  summary.
- `reports/agent-harness-flow.current.json` readiness summary.
- confirmation that real local execution remains disabled and no SQL, package,
  OCR/RAG/model, or training dependency was added.
