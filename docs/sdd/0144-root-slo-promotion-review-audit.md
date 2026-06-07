# SDD 0144: Root SLO Promotion Review Audit

## Problem

Cross-module DB and queue diagnostics removed the last structural evidence gap
before root SLO review, but the system still needs a conservative promotion
gate before any full-system capacity claim is accepted.

Early evidence correctly blocked promotion because it mixed module-only peaks,
shallow workflow evidence, weak headroom, and root-level tail latency above the
interactive target. Later production10k evidence can pass when it proves the
same root workflow set under target pressure with zero errors, sufficient
samples, sufficient PgBouncer headroom, and max root P99 within the 50 ms
target. The audit must therefore support both outcomes: block incomplete or
slow evidence, and approve qualified production target evidence.

## Scope

In scope:

- Add `tools/root-slo-promotion-review-audit.mjs`.
- Read the immutable root requirements file without modifying it.
- Read root workflow coverage, cross-module DB/queue diagnostics, sustained
  mixed workload scale-up, and strict quality reports.
- Apply explicit promotion gates for:
  - no contract-only root workflow in a runtime SLO claim;
  - no root module stuck at smoke-only, policy-only, worker-boundary-only, or
    review-only evidence;
  - max root interactive P99 within the review target;
  - PgBouncer headroom above the review threshold;
  - sustained mixed workload scale depth at or above the review threshold.
- Keep audit readiness separate from promotion approval. A report can be
  `READY` while its decision is `BLOCK_PROMOTION` or `APPROVE_PROMOTION`.
- Wire the audit into npm scripts and the quality gate.
- Register the report as performance evidence.
- Let the system capacity claim audit consume the review result and mirror the
  current claim status from the root SLO review.

Out of scope:

- Running a new live benchmark.
- Adding model, OCR, RAG, vector, embedding, training, or load-generation
  dependencies to the baseline.
- Weakening quality gates to make promotion easier.
- Claiming 10 ms P99 support from evidence that only satisfies the 50 ms target.

## Contracts

- `npm run audit:root-slo-promotion-review` writes
  `reports/root-slo-promotion-review.current.json`.
- The report uses `workloadType=ROOT_SLO_PROMOTION_REVIEW`.
- The report has `readiness=READY` when prerequisite evidence is readable and
  ready.
- The report has `promotion.decision=BLOCK_PROMOTION` when root SLO gates fail.
- The report has `promotion.decision=APPROVE_PROMOTION` when root workflow
  coverage, quality, headroom, production target pressure, throughput, samples,
  zero-error, and 50 ms latency gates all pass.
- The report has `promotion.claimStatus` set to one of:
  - `SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW`;
  - `NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW`.
- The current expected decision follows the evidence. As of the latest
  production10k default-final sustained report, the current decision is
  `APPROVE_PROMOTION` for the 10k read/write RPS and 50 ms P99 claim.
- The capacity claim audit recognizes root SLO promotion review evidence but
  does not convert a blocked review into a supported full-system claim.

## Acceptance Criteria

- Focused tests prove incomplete or slow evidence is review-ready but blocks
  promotion.
- Focused tests fail readiness when immutable root requirements text is missing.
- Focused tests fail readiness when root workflow coverage is not ready.
- Focused tests fail readiness when cross-module diagnostics are not ready.
- Focused tests prove promotion remains blocked when SLO gates fail.
- Focused tests prove promotion can only approve when every SLO gate is
  satisfied.
- Focused tests fail readiness when strict quality is not passing.
- Capacity audit tests prove a blocked root SLO review changes the full-system
  claim to not supported by current root SLO review.
- Capacity audit tests prove an approved root SLO review changes the
  full-system 10k/50ms claim to supported by current root SLO review.
- `node --check tools/root-slo-promotion-review-audit.mjs` passes.
- `node --test tools/root-slo-promotion-review-audit.test.mjs` passes.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the root SLO promotion review audit, focused tests, package script,
quality gate command, generated report, performance registry entry, capacity
audit changes, and this SDD. The previous system capacity claim must again list
`PROMOTION_REVIEW_AGAINST_ROOT_SLOS` as missing evidence.

## Observability And Performance Evidence

The report records:

- immutable root requirement anchors used by the review;
- promotion policy thresholds;
- root workflow coverage readiness and contract-only workflow count;
- shallow module evidence classifications;
- max root interactive P99 and its source;
- PgBouncer max server connections, hot-path pool total, and headroom;
- sustained mixed workload highest passed step and error counts;
- audit findings separated from promotion findings;
- promotion decision, blockers, and required next evidence.

The current production10k default-final sustained evidence supports the 10k
read/write RPS claim under the 50 ms interactive P99 target: 22,435.1
read/write RPS, max P99 44.44 ms, zero workload errors, two samples, and target
pressure met. It does not support a 10 ms P99 claim, and it does not prove
heavy AI/RAG/OCR/model-training runtime capacity. Future performance work should
attach to new functional slices instead of repeating broad probes without a new
acceptance question.
