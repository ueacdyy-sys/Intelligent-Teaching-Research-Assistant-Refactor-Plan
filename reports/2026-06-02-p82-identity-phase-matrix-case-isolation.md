# P82 Identity Phase Matrix Case Isolation

## Summary

P82 adds `--case-isolation none|docker-reset` to the Identity phase matrix
runner. The default remains `none`, preserving the existing one-setup-per-matrix
behavior. With `docker-reset`, the runner resets and starts the Identity session
Docker profile before every case.

This addresses the P81 order-effect finding: same-run case comparisons should
not treat the second case as a clean win unless each case starts from a
comparable runtime state.

## Evidence

- SDD: `docs/sdd/0173-identity-phase-matrix-case-isolation.md`
- Matrix report: `reports/identity-phase-matrix.p82-case-isolation-min-conns-smoke.json`
- Child reports:
  - `reports/identity-phase-matrix.p82-case-isolation-min-conns-smoke.1-g2-p8-min0-isolated-i2-c64.json`
  - `reports/identity-phase-matrix.p82-case-isolation-min-conns-smoke.2-g2-p8-min8-isolated-i2-c64.json`

## Contract

Default matrix setup stays unchanged:

```json
{
  "caseIsolation": "none",
  "setup": ["setup-reset", "setup-up"]
}
```

Isolated matrix setup:

```json
{
  "caseIsolation": "docker-reset",
  "setup": [
    "case-g2-p8-min0-isolated-i2-c64-reset",
    "case-g2-p8-min0-isolated-i2-c64-up",
    "case-g2-p8-min8-isolated-i2-c64-reset",
    "case-g2-p8-min8-isolated-i2-c64-up"
  ]
}
```

## Smoke Profile

| Setting | Value |
| --- | ---: |
| Gateway workers | 2 |
| Session DB max conns per worker | 8 |
| Ingress workers | 2 |
| Client max conns per host | 64 |
| Client warm conns per host | 32 |
| Ingress max conns per host | 32 |
| Ingress warm conns per host | 16 |
| Concurrency | 128 |
| Operations per phase | 256 |
| Session table persistence | unlogged |
| Benchmark runtime | docker |
| Case isolation | docker-reset |

## Results

| Case | Min conns per worker | Status | Max phase P99 ms | Total pool acquire ms | Dominant pool wait |
| --- | ---: | --- | ---: | ---: | --- |
| `g2-p8-min0-isolated-i2-c64` | 0 | PASSED | 125.15 | 31679.59 | `revokeCycle.revokeOwnSession` |
| `g2-p8-min8-isolated-i2-c64` | 8 | PASSED | 95.84 | 31342.59 | `revokeCycle.revokeOwnSession` |

Phase highlights:

| Case | Password login P99 ms | Revoke cycle P99 ms | Revoke pool share |
| --- | ---: | ---: | ---: |
| `min0` | 125.15 | 98.44 | 0.87 |
| `min8` | 95.84 | 85.26 | 0.83 |

## Interpretation

- The runner now provides an evidence mode for fairer case comparisons.
- The isolated smoke passed both cases with zero errors.
- In this narrow isolated run, `minConns=8` reduced max phase P99 from
  `125.15ms` to `95.84ms`, but total pool acquire time stayed nearly flat
  (`31679.59ms` vs `31342.59ms`).
- This makes `minConns=8` a candidate for a larger isolated matrix, not a safe
  default promotion.
- The dominant bottleneck remains `revokeCycle.revokeOwnSession` pool acquire
  wait, so the next tuning slice should still target session write pool pressure
  and case-order-safe evidence.

## Acceptance

- `node --test tools\run-identity-http-benchmark.test.mjs tools\run-identity-phase-matrix.test.mjs`
- `npm run verify:structure`
- Docker-backed isolated smoke with `--case-isolation docker-reset`
- `--docker-cleanup reset` left no running Identity session containers.

## Next Step

Run a larger isolated matrix that varies gateway count, pool max, and min
connections together. Only promote a default when the isolated matrix shows
lower P99 and lower pool-acquire pressure across repeated or reversed cases.
