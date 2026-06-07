# SDD 0203: Root SLO Production10k Evidence Selection

## Problem

SDD 0202 produced target-bearing production10k mixed read/write evidence, but
at this historical slice the Root SLO promotion review still read
`reports/system-sustained-mixed-workload-scaleup.current.json`, whose latest
standard high step is only `1950.32 RPS` and whose latency blocker comes from
older module-limit diagnostics such as Identity `3071.17ms` P99.

That was the wrong evidence boundary for the production 10k claim. The root
review needed to consume the target-bearing production10k sustained report
before it could fairly decide whether the claim was supported or blocked.

## Current Status

This SDD records the historical evidence-selection fix. It has been superseded
by the later production10k default-final sustained evidence and SDD 0144/0186
policy updates. The current source of truth is:

- `reports/system-sustained-mixed-workload-scaleup.production10k-default-final-sustained.current.json`
- `reports/root-slo-promotion-review.current.json`
- `reports/system-capacity-claim.current.json`

Current result: 22,435.1 read/write RPS, max P99 44.44 ms, zero errors,
`APPROVE_PROMOTION` for the 10k/50ms claim. Do not use this older SDD as a
reason to repeat production10k testing unless the acceptance question changes.

## Scope

- Add a production target scale-up source report to the Root SLO review:
  `reports/system-sustained-mixed-workload-scaleup.production10k-default-final-sustained.current.json`.
- Prefer that production target evidence for:
  - measured read/write RPS,
  - target attempt status,
  - root promotion latency P99,
  - sustained step depth.
- Keep old cross-module diagnostics as context, not as the promotion-blocking
  latency sample, when target-bearing production evidence is present.
- Keep the review conservative: at this slice, the target-bearing report passed
  throughput but still blocked promotion while max P99 was above the then-active
  root target.
- Register the production target report as performance evidence so capacity
  claims can trace the Root SLO decision back to the raw data.

## Non-Goals

- Re-running production10k in this slice.
- Lowering the root interactive P99 target.
- Claiming cloud production SLA from local workstation evidence.
- Removing cross-module diagnostics or module-capacity context.

## Contracts

- If production target evidence is present and target-configured, Root SLO
  throughput must come from that report before falling back to the standard
  sustained scale-up report.
- If production target evidence is present, Root SLO latency must use the
  production target max P99, not old module-limit extremes.
- A `MET` throughput target above 10k removes
  `promotion.production_read_write_rps_target_met`.
- P99 above the active root target must keep
  `promotion.interactive_tail_latency_within_target` blocked.
- Missing production target evidence must keep the old fallback behavior so the
  audit never approves from absent evidence.

## Acceptance Criteria

- `node --test tools/root-slo-promotion-review-audit.test.mjs` proves the
  review uses the production10k report before older module-limit diagnostics.
- The same test suite proves fallback behavior when production target evidence
  is missing.
- `npm run audit:root-slo-promotion-review` regenerates
  `reports/root-slo-promotion-review.current.json` using production target
  evidence before older module-limit diagnostics.
- `npm run audit:system-capacity-claim` reflects the updated Root SLO review
  and no longer asks for `PRODUCTION_10000_RPS_SUSTAINED_EVIDENCE`.
- `npm run quality` passes before commit.

## Rollback

Remove the production target source from the Root SLO audit and fall back to
`reports/system-sustained-mixed-workload-scaleup.current.json`. The system
remains conservative, but Root SLO promotion will again under-report the current
production10k throughput evidence.
