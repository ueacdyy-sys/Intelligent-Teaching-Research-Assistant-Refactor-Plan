# P81 Identity Phase Matrix Case Min Connections

## Summary

P81 makes Identity phase matrix cases support per-case
`sessionDbMinConns`. The existing 8-field compact case spec still works and
inherits the global `--session-db-min-conns`; a new 9-field form can set
`sessionDbMinConns` per case.

This is a benchmarking-tool improvement, not a production default change. It
lets one matrix run compare `minConns=0` and `minConns=8` without manually
launching separate commands.

## Evidence

- SDD: `docs/sdd/0172-identity-phase-matrix-case-min-conns.md`
- Forward paired matrix: `reports/identity-phase-matrix.p81-case-min-conns-paired-smoke.json`
- Reverse paired matrix: `reports/identity-phase-matrix.p81-case-min-conns-paired-reverse-smoke.json`
- Child reports:
  - `reports/identity-phase-matrix.p81-case-min-conns-paired-smoke.1-g2-p8-min0-i2-c64.json`
  - `reports/identity-phase-matrix.p81-case-min-conns-paired-smoke.2-g2-p8-min8-i2-c64.json`
  - `reports/identity-phase-matrix.p81-case-min-conns-paired-reverse-smoke.1-g2-p8-min8-first-i2-c64.json`
  - `reports/identity-phase-matrix.p81-case-min-conns-paired-reverse-smoke.2-g2-p8-min0-second-i2-c64.json`

## Contract

Legacy case spec:

```text
name:gatewayCount:sessionDbMaxConns:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost
```

Case-scoped min-connections spec:

```text
name:gatewayCount:sessionDbMaxConns:sessionDbMinConns:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost
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

## Results

Forward order:

| Case | Order | Min conns per worker | Status | Max phase P99 ms | Total pool acquire ms | Dominant pool wait |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| `g2-p8-min0-i2-c64` | 1 | 0 | PASSED | 121.99 | 31020.61 | `revokeCycle.revokeOwnSession` |
| `g2-p8-min8-i2-c64` | 2 | 8 | PASSED | 81.78 | 20249.43 | `revokeCycle.revokeOwnSession` |

Reverse order:

| Case | Order | Min conns per worker | Status | Max phase P99 ms | Total pool acquire ms | Dominant pool wait |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| `g2-p8-min8-first-i2-c64` | 1 | 8 | PASSED | 95.70 | 31307.12 | `revokeCycle.revokeOwnSession` |
| `g2-p8-min0-second-i2-c64` | 2 | 0 | PASSED | 85.25 | 20537.79 | `revokeCycle.revokeOwnSession` |

## Interpretation

- The runner now supports case-scoped `sessionDbMinConns` and records the values
  in matrix target profiles and case configs.
- Both forward and reverse matrices passed with zero errors.
- The second case in each matrix was faster regardless of whether it used
  `minConns=0` or `minConns=8`. That means the paired matrix exposed an order
  effect; it does not prove that `minConns=8` is a better default.
- The dominant pool wait remained `revokeCycle.revokeOwnSession` in all four
  cases, so the underlying bottleneck class is still session write pool acquire
  wait.

## Acceptance

- `node --test tools\run-identity-http-benchmark.test.mjs tools\run-identity-phase-matrix.test.mjs`
- `npm run verify:structure`
- Forward and reverse Docker-backed paired smoke runs passed with
  `--docker-cleanup reset`.

## Next Step

The next useful performance tooling slice is per-case isolation or randomized
case ordering for phase matrix comparisons. Without that, same-run case
comparisons can identify candidates, but they should not be used alone to
promote a capacity or default-configuration claim.
