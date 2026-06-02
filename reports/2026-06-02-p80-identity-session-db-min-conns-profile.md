# P80 Identity Session DB Min Connections Profile

## Summary

P80 exposes `SESSION_DB_MIN_CONNS` as an explicit Identity session DB pool
profile field and threads it through the HTTP benchmark runner and phase matrix
runner. The default remains `0`, so normal runtime behavior is unchanged.

The measured smoke comparison did not prove a performance win for warming every
gateway pool to max. In this profile, `minConns=8` passed, but it was slower
than the same-shape `minConns=0` control.

## Evidence

- SDD: `docs/sdd/0171-identity-session-db-min-conns-profile.md`
- Control matrix: `reports/identity-phase-matrix.p80-session-db-min-conns-control.json`
- Warm-pool matrix: `reports/identity-phase-matrix.p80-session-db-min-conns-smoke.json`
- Control child report: `reports/identity-phase-matrix.p80-session-db-min-conns-control.1-g2-p8-min0-i2-c64.json`
- Warm-pool child report: `reports/identity-phase-matrix.p80-session-db-min-conns-smoke.1-g2-p8-min8-i2-c64.json`

## Scope

The test shape was intentionally small and paired:

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

## Results

| Case | Status | Min conns per worker | Total min conns | Max phase P99 ms | Total pool acquire ms | Dominant pool wait |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `g2-p8-min0-i2-c64` | PASSED | 0 | 0 | 106.33 | 30807.08 | `revokeCycle.revokeOwnSession` |
| `g2-p8-min8-i2-c64` | PASSED | 8 | 16 | 112.41 | 37359.77 | `passwordLogin.saveSession` |

## Interpretation

- The new setting is now measurable and reportable end to end.
- `minConns=8` is not a safe default promotion. It increased max phase P99 by
  about `5.72%` versus the paired control and increased total pool acquire time
  by about `21.27%`.
- The bottleneck is still connection acquire wait under write-heavy session
  operations. Warming the pool did not remove that pressure in this shape.
- This result supports keeping `SESSION_DB_MIN_CONNS=0` as the default while
  preserving the option for future cold-start or larger-matrix probes.

## Acceptance

- `go test ./services/identity-access-gateway/cmd/gateway -count=1`
- `node --test tools\run-identity-http-benchmark.test.mjs tools\run-identity-phase-matrix.test.mjs`
- `npm run verify:structure`

## Next Step

Do not tune from min connections alone. The next useful step is a paired matrix
that varies pool size, gateway count, and min connections together, then checks
whether the dominant wait moves from pool acquire to SQL execution or to another
module.
