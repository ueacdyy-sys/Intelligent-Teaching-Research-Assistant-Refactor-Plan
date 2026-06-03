# SDD 0210: Root SLO 50ms Fast-Lane Architecture Gate

## Problem

SDD 0209 intentionally tightened the Root SLO review to a sub-10ms P99 target.
That remains the excellent target, but the active production goal now separates
the latency ladder:

- `10ms` P99 is the excellent target.
- `50ms` P99 is the pass target for current production-grade promotion.

The current production10k evidence still proves high throughput, not low tail
latency: the selected sustained mixed workload is above 10k read/write RPS with
zero errors, while the interactive P99 remains above the new 50ms pass target.

Recent target-10k probes also showed that small configuration moves can shift
the bottleneck between Conversation, Teaching, and Identity, but they do not
bring synchronous PostgreSQL write paths near 50ms P99. Treating Go runtime
choice or batch-worker count as the whole solution would hide the real
architecture issue: interactive requests are still waiting for synchronous
database mutation and projection work.

## Source Requirement References

- Root requirements remain immutable:
  `C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`.
- Modules are execution slices of the whole-system refactor, not standalone
  PoCs.
- Full-system capacity claims still require Docker/WSL multi-worker sustained
  mixed read/write evidence and Root SLO promotion review.
- Current latency bar is 50ms P99 pass target and 10ms P99 excellent target.
- Local secrets remain `ueacd` and must stay masked in reports.
- Baseline must not add Mem0, Milvus, vLLM, SFT/RL, training, vector, or other
  heavy AI/runtime dependencies.

## Scope

- Change Root SLO promotion policy from a single 10ms target to a two-tier
  latency policy:
  - `interactiveP99TargetMs=50`
  - `interactiveP99ExcellentMs=10`
  - `interactiveP99TargetClass=PASS_TARGET`
- Keep Root SLO promotion blocked until measured production10k P99 is within
  the 50ms pass target.
- When the latency gate blocks, require durable fast-lane runtime evidence
  instead of a generic latency-remediation note.
- Define the next architecture direction: root write-heavy workflows need
  durable command acceptance, idempotency, policy enforcement, and asynchronous
  projection before they can make low-latency production claims.

## Non-Scope

- Claiming the current system has reached 50ms or 10ms P99.
- Weakening the 10k read/write RPS target, removing any root workflow from the
  sustained mixed workload, or accepting errors.
- Returning success from volatile in-memory queues that can lose accepted user
  work.
- Adding Redis, Kafka, model, vector, training, or other baseline dependencies
  without a later isolated SDD and rollback gate.

## Architecture Direction

The low-latency path must separate command acceptance from heavy projection:

1. Validate identity, principal scope, idempotency key, request shape, and
   domain constraints at the HTTP boundary.
2. Append a durable command record before the API returns acceptance.
3. Return a stable command id, target resource id when known, command status,
   and polling/subscription link.
4. Project the command into the normalized read model asynchronously.
5. Expose observability for queue depth, command age, projection lag, retry
   count, dead-letter count, and P99 acceptance latency.
6. Keep generated-code execution, device control, and remote-agent actions
   behind the existing Harness Engineering approval boundary.

This keeps business safety intact: the system may answer faster, but it must not
pretend work is accepted before it has a recoverable command record.

## Contracts

Root SLO promotion policy now exposes:

```json
{
  "interactiveP99TargetMs": 50,
  "interactiveP99ExcellentMs": 10,
  "interactiveP99TargetClass": "PASS_TARGET"
}
```

When current evidence exceeds 50ms P99, `requiredNextEvidence` must include:

```json
"ROOT_DURABLE_FAST_LANE_RUNTIME_EVIDENCE"
```

## Acceptance Criteria

- Focused Root SLO tests prove the policy exposes the 50ms pass target and 10ms
  excellent target.
- Current production10k evidence remains blocked by
  `promotion.interactive_tail_latency_within_target`.
- The latency blocker requires `ROOT_DURABLE_FAST_LANE_RUNTIME_EVIDENCE`.
- Root SLO and system capacity reports regenerate without weakening throughput,
  zero-error, module-depth, PgBouncer headroom, or quality gates.
- `npm run quality` passes after report regeneration.

## Rollback Plan

- Restore SDD 0209's single 10ms policy if the active production goal removes
  the 50ms pass target.
- Restore `ROOT_INTERACTIVE_TAIL_LATENCY_REMEDIATION` as the generic next
  evidence only if fast-lane durable command architecture is explicitly
  rejected.

## Observability And Performance Evidence

- Official evidence files remain under `reports/`.
- Root SLO reports must keep workload hotspots so the slowest root workflows are
  visible to non-expert reviewers.
- Later fast-lane runtime evidence must include both acceptance latency and
  projection lag; acceptance-only evidence is insufficient for business safety.
