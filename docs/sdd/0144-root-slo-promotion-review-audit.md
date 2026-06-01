# SDD 0144: Root SLO Promotion Review Audit

## Problem

Cross-module DB and queue diagnostics removed the last structural evidence gap
before root SLO review. That does not mean the system supports full-system
ultra-concurrency. The current evidence still includes module-only peaks,
smoke-only Teaching Archive evidence, policy-only Knowledge evidence,
worker-boundary-only AI runtime evidence, a contract-only workflow/plugin path,
Identity tail latency near three seconds, and only one PgBouncer server
connection of hot-path headroom.

The refactor needs a promotion review that can read all current root evidence
and make the conservative call: current evidence may be reviewable, while the
full-system ultra-concurrency claim is still blocked.

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
  `READY` while its decision is `BLOCK_PROMOTION`.
- Wire the audit into npm scripts and the quality gate.
- Register the report as performance evidence.
- Let the system capacity claim audit consume the review result and report that
  full-system ultra-concurrency is not supported by the current root SLO review.

Out of scope:

- Claiming full-system ultra-concurrency support from the current evidence.
- Running a new live benchmark.
- Adding model, OCR, RAG, vector, embedding, training, or load-generation
  dependencies to the baseline.
- Weakening quality gates to make promotion easier.

## Contracts

- `npm run audit:root-slo-promotion-review` writes
  `reports/root-slo-promotion-review.current.json`.
- The report uses `workloadType=ROOT_SLO_PROMOTION_REVIEW`.
- The report has `readiness=READY` when prerequisite evidence is readable and
  ready.
- The report has `promotion.decision=BLOCK_PROMOTION` when root SLO gates fail.
- The report has `promotion.claimStatus` set to one of:
  - `SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW`;
  - `NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW`.
- The current expected decision is `BLOCK_PROMOTION`.
- The capacity claim audit recognizes root SLO promotion review evidence but
  does not convert a blocked review into a supported full-system claim.

## Acceptance Criteria

- Focused tests prove current evidence is review-ready but blocks promotion.
- Focused tests fail readiness when immutable root requirements text is missing.
- Focused tests fail readiness when root workflow coverage is not ready.
- Focused tests fail readiness when cross-module diagnostics are not ready.
- Focused tests prove promotion remains blocked when SLO gates fail.
- Focused tests prove promotion can only approve when every SLO gate is
  satisfied.
- Focused tests fail readiness when strict quality is not passing.
- Capacity audit tests prove a blocked root SLO review changes the full-system
  claim to not supported by current root SLO review.
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

The current expected evidence says: do not promote. The next performance work
must improve runtime SLO depth, identity/conversation tail latency, PgBouncer
headroom, and sustained mixed workload scale before another promotion review.
