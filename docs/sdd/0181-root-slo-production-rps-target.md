# SDD 0181: Root SLO Production RPS Target

## Problem

The refactor already blocks broad "full-system ultra-concurrency" claims when
root workflow coverage, module evidence depth, tail latency, PgBouncer headroom,
or sustained scale depth is insufficient. The updated product target is more
concrete: production read/write throughput should reach the 10k RPS class while
the user experience remains extremely smooth.

The current root SLO promotion review does not encode that 10k RPS target. It
also uses a 1000 ms interactive P99 review target, which is too loose for a
top-tier fluid application goal. Without an explicit target, future reports can
keep saying "ultra-concurrency" without proving sustained read/write RPS.

## Source Requirement References

- Root requirements: the system is a full teaching and research assistant, not
  a single-module benchmark.
- SDD 0144: root SLO promotion review must keep readiness separate from
  promotion approval and block unsupported full-system claims.
- System capacity evidence currently blocks full-system promotion because root
  runtime coverage, module evidence depth, interactive tail latency, and
  sustained scale depth are insufficient.
- Updated performance objective: production environment read/write concurrency
  target is the 10k RPS class, with top-tier smooth and fast interaction.

## Scope

In scope:

- Rename the reviewed claim to a production 10k read/write RPS claim.
- Add `productionReadWriteRpsTarget=10000` to the root SLO promotion policy.
- Tighten the interactive P99 target used by the promotion review to a
  top-tier target of 300 ms.
- Add a promotion finding that blocks when sustained mixed workload evidence
  does not contain a measured aggregate read/write RPS at or above 10000.
- Add a required-next-evidence code for missing production RPS proof.
- Keep audit readiness separate from promotion approval; current evidence should
  remain review-ready but blocked.

Out of scope:

- Claiming current support for 10k production RPS.
- Running a new high-load benchmark in this slice.
- Adding model, OCR, RAG, vector, embedding, training, or load-generation
  dependencies.
- Weakening quality, root requirements, or promotion gates.

## Contracts

Root SLO promotion policy includes:

```json
{
  "reviewedClaim": "FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS",
  "productionReadWriteRpsTarget": 10000,
  "interactiveP99TargetMs": 300
}
```

Promotion evidence includes:

```json
{
  "productionThroughput": {
    "targetReadWriteRps": 10000,
    "measuredReadWriteRps": null,
    "source": "missing"
  }
}
```

Promotion findings include:

```json
{
  "id": "promotion.production_read_write_rps_target_met",
  "passed": false,
  "expected": "measured sustained read/write RPS >= 10000"
}
```

If this finding blocks promotion, `requiredNextEvidence` includes
`PRODUCTION_10000_RPS_SUSTAINED_EVIDENCE`.

## Acceptance Criteria

- Focused tests prove the current root SLO review is ready but blocks promotion
  with the explicit 10k RPS production target missing.
- Focused tests prove the policy records the 10k RPS target and 300 ms
  top-tier interactive P99 target.
- Focused tests prove promotion can only approve when root workflow coverage,
  module evidence depth, tail latency, database headroom, sustained scale depth,
  and measured production RPS all pass.
- Focused tests prove required-next-evidence includes
  `PRODUCTION_10000_RPS_SUSTAINED_EVIDENCE` when production RPS proof is absent.
- `node --check tools/root-slo-promotion-review-audit.mjs` passes.
- `node --test tools/root-slo-promotion-review-audit.test.mjs` passes.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` pass.

## Rollback

Remove the production RPS policy fields, throughput evidence, promotion finding,
required-next-evidence mapping, tests, regenerated reports, and this SDD. The
root SLO promotion review returns to the broader `FULL_SYSTEM_ULTRA_CONCURRENCY`
claim without an explicit 10k RPS target.
