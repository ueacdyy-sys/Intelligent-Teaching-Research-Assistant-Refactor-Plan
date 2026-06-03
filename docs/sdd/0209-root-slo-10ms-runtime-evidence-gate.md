# SDD 0209: Root SLO 10ms Runtime Evidence Gate

## Problem

The current `production10k` sustained mixed workload evidence proves the system
can exceed 10k mixed read/write RPS with zero errors, but the latest goal raises
the latency bar from the previous 300ms Root SLO to a sub-10ms production-grade
interactive P99 target.

At the same time, cross-module diagnostics were still classifying Teaching,
Knowledge, and AI Worker evidence as shallow because the audit only recognized a
step named `high`. The current sustained workload uses a stronger `target-10k`
step, so module runtime evidence was present but not selected.

## Source Requirement References

- Root requirements remain immutable:
  `C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`.
- Modules are delivery slices of the full-system refactor, not isolated PoCs.
- Production concurrency evidence must come from sustained mixed read/write
  workloads with Docker/WSL multi-worker execution.
- Current performance direction is 10k RPS plus sub-10ms interactive P99.
- Local fixed secret values must remain masked in reports and must not expose
  unmasked secrets or DB URLs.

## Scope

- Treat sustained workload steps at `high` or stronger as valid module runtime
  evidence when the report passed, total errors are zero, orchestration errors
  are zero, and the named workload is present with zero errors.
- Recognize `target-10k` as stronger than `high` for module depth evidence.
- Tighten Root SLO promotion review `interactiveP99TargetMs` to `10`.
- Keep the promotion review blocking when current P99 remains above 10ms.

## Non-Scope

- Claiming the full system has achieved sub-10ms P99.
- Lowering workload pressure, removing Teaching/Knowledge/AI Worker from the
  mixed workload, or weakening quality gates.
- Adding heavy training/vector/runtime dependencies to the baseline.

## Contracts

- No public HTTP API contract changes.
- Audit contract semantics change: `target-10k` sustained evidence can promote
  module depth, while Root SLO promotion remains blocked by the 10ms latency
  target until measured evidence satisfies it.

## Acceptance Criteria

- Cross-module diagnostics promote Teaching, Knowledge, and AI Worker module
  classifications from shallow evidence when `target-10k` workload evidence is
  present and clean.
- Cross-module diagnostics still fall back to shallow classification when the
  qualifying workload is missing.
- Root SLO promotion review reports `interactiveP99TargetMs=10`.
- Current Root SLO promotion remains blocked by
  `promotion.interactive_tail_latency_within_target`, not by module evidence
  depth.
- `npm run quality` passes after report regeneration.

## Rollback Plan

- Restore Root SLO `interactiveP99TargetMs` to the previous 300ms target if the
  active performance goal is downgraded.
- Restore the previous `high`-only runtime evidence selector if target-bearing
  steps are removed from sustained mixed workload reports.

## Observability And Performance Evidence

- Official evidence files remain under `reports/`.
- Root SLO reports must identify the exact blocker and required next evidence.
- Cross-module reports must include the selected workload name, selected step,
  errors, P95/P99 where available, and step read/write RPS.
