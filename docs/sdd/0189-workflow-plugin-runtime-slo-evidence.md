# SDD 0189: Workflow Plugin Runtime SLO Evidence

## Problem

The root SLO promotion review still blocks the production 10k read/write RPS
claim because `workflow_plugin_self_evolution` has only contract and registry
admission evidence. The workflow/plugin path is safety-sensitive: it represents
generated workflow or plugin artifacts, sandbox testing, human approval, and
registry save. It needs runtime SLO evidence, but this slice must not enable
generated-code execution or weaken Harness controls.

## Source Requirement References

- Immutable root requirements include workflow, plugin, automatic testing,
  human performance/effect review, and self-evolution requirements.
- Whole-system refactor constraint: this workflow/plugin slice must feed root
  SLO evidence, not act as an isolated proof of concept.
- SDD 0181 requires full-system production claims to pass Root SLO promotion
  gates.
- SDD 0187 and SDD 0188 require Agent/Workflow capabilities to stay behind
  Harness policy, evidence, rollback, and approval boundaries.

## Scope

In scope:

- Add a Docker-free `workflow-plugin-runtime-slo` audit that measures the safe
  dry-run runtime chain:
  contract flow audit, registry admission, approved-path revision check, and
  failed-sandbox revision feedback.
- Record step timings, P95/P99, total errors, dry-run-only execution mode,
  sandbox/no-host-write/default-deny network invariants, and revision safety.
- Teach root workflow coverage and Root SLO promotion review to distinguish
  runtime SLO evidence from mixed workload evidence.
- Register the new report in the performance evidence registry and strict
  quality gate.

Out of scope:

- Executing generated workflow or plugin code locally.
- Enabling registry entries as executable artifacts.
- Installing model, OCR, RAG, vector, embedding, training, Mem0, Milvus, vLLM,
  SFT/RL, or FP8 dependencies.
- Claiming the whole system supports 10k RPS after this slice.

## Contracts

The runtime SLO report must expose:

```text
readiness, workloadType=WORKFLOW_PLUGIN_RUNTIME_SLO,
runtimeSlo.targetP99Ms, runtimeSlo.p95Ms, runtimeSlo.p99Ms,
runtimeSlo.totalErrors, runtimeSlo.steps[]
```

Each measured step must record:

```text
name, status, durationMs, error
```

Safety invariants must record:

```text
dryRunOnly, localExecutionEnabled, localGeneratedCodeExecuted,
sandboxExecuted, sandboxNoHostWrite, networkPolicy,
approvedPathRevisionRequired, failedSandboxRevisionRequired
```

Root workflow coverage must count a workflow as not contract-only when it has
passing `runtimeEvidenceResults` even if it is not part of the sustained mixed
read/write workload.

## Acceptance Criteria

- Focused workflow/plugin runtime SLO tests pass.
- Root workflow coverage reports zero contract-only workflows when the runtime
  SLO report is ready.
- Root SLO promotion review no longer requires
  `ROOT_WORKFLOW_RUNTIME_SLO_COVERAGE` for the current evidence, while keeping
  remaining throughput, module-depth, and latency blockers.
- Performance evidence registry includes the new runtime SLO report.
- `npm run verify:structure`, focused tests, strict quality, `git diff --check`,
  secret scan, and Docker cleanup check pass.

## Rollback

Remove the runtime SLO audit tool and test, remove the npm script, restore root
workflow coverage and Root SLO contract-only logic, remove the registry entry
and report, and delete this SDD. Generated code execution remains disabled both
before and after rollback.
