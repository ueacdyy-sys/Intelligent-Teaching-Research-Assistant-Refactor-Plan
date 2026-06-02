# SDD 0191: Module Runtime Depth From Sustained Evidence

## Problem

Root SLO promotion is still blocked by `promotion.module_evidence_depth_sufficient`
even though several root slices already participate in the sustained mixed
workload scale-up and the workflow/plugin slice has dry-run runtime SLO
evidence. The cross-module diagnostics report still hard-codes Teaching,
Knowledge, AI worker, and Agent/Workflow as smoke or boundary-only classes.
That makes the Root SLO review understate current evidence depth while still
correctly blocking the 10k RPS claim on latency and throughput.

## Source Requirement References

- Immutable root requirements remain the source of truth.
- The refactor is whole-system first; modules are delivery slices, not isolated
  proofs of concept.
- Current full-system promotion target remains
  `FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS`.
- Current sustained mixed workload high step records zero errors, max P99 94ms,
  and 2107.3 read/write RPS across identity, conversation, teaching archive,
  knowledge retrieval, and AI worker admission.
- Workflow/plugin runtime SLO evidence remains dry-run only and must not enable
  local generated-code execution.

## Scope

In scope:

- Teach cross-module diagnostics to promote module classifications only when
  module-specific reports are ready and runtime evidence is present.
- Use sustained mixed workload high-step evidence for Teaching, Knowledge, and
  AI worker admission.
- Use workflow/plugin runtime SLO evidence for Agent Harness and workflow/plugin
  self-evolution.
- Use cross-module diagnostics in the system capacity claim audit so module
  limit summaries do not contradict Root SLO module-depth evidence.
- Keep fallback classifications when evidence is missing, slow, unsafe, or not
  clean.
- Regenerate cross-module diagnostics, system capacity claim, performance
  evidence, and Root SLO review reports.

Out of scope:

- Changing benchmark numbers.
- Claiming 10k RPS readiness.
- Reducing identity tail latency.
- Installing OCR, vector, embedding, Mem0, Milvus, vLLM, SFT, RL, or training
  dependencies in the baseline.

## Contracts

Runtime-depth promotion requires:

```text
moduleReportReady && runtimeEvidence.present && runtimeEvidence.passed
```

Sustained mixed workload runtime evidence requires:

```text
sustainedScaleUp.status == PASSED
highestPassedStep == high
summary.totalErrors == 0
summary.orchestrationErrors == 0
highStep.workload.errors == 0
```

Workflow/plugin runtime evidence requires:

```text
workflowPluginRuntimeSlo.readiness == READY
runtimeSlo.totalErrors == 0
runtimeSlo.p99Ms <= runtimeSlo.targetP99Ms
localExecutionEnabled == false
localGeneratedCodeExecuted == false
sandboxNoHostWrite == true
```

## Acceptance Criteria

- Teaching, Knowledge, AI worker, and Agent/Workflow classifications no longer
  match Root SLO shallow evidence patterns when current runtime evidence is
  present and clean.
- Missing high-step Teaching workload evidence falls back to `MODULE_SMOKE_ONLY`.
- Slow workflow/plugin runtime SLO evidence falls back to
  `REVIEW_ONLY_QUEUE_BOUNDARY`.
- Root SLO review no longer lists
  `MODULE_RUNTIME_SLO_DEPTH_FOR_TEACHING_KNOWLEDGE_WORKER_AGENT` when current
  evidence is clean.
- Root SLO review still blocks promotion on interactive tail latency and
  production 10k read/write RPS.
- System capacity claim module limits use runtime-backed classifications when
  cross-module diagnostics are registered and parseable; missing diagnostics
  keep the older conservative module summaries.
- Focused tests, `npm run quality`, and `git diff --check` pass.

## Rollback

Revert this SDD, the cross-module diagnostics changes, related tests, and
regenerated current reports. The previous diagnostics will again report the
Teaching, Knowledge, AI worker, and Agent/Workflow paths as smoke or
boundary-only evidence.
