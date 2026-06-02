# P73 Identity Config Limit Probe

## Context

P72 rolled Identity phase attribution into system mixed reports and showed that
`mixed1600` is still controlled by Identity `revokeCycle`. The child
diagnostics showed material gateway-side database pool acquire wait in the
revoke-heavy path.

P73 tested whether the current `12 workers x pool10` Identity shape is limited
by simple worker or per-worker pool placement. This is a configuration probe,
not a behavior change and not a capacity promotion.

## Hypotheses

1. More Identity gateway workers with the same total session pool may reduce
   gateway-local queueing: `15 workers x pool8 = 120 total`.
2. A larger per-worker Identity session pool may reduce revoke-cycle pool wait:
   `12 workers x pool12 = 144 total`.
3. A same-run baseline rerun is required because single-sample performance
   evidence is noisy.

## Commands

All runs used `npm run bench:system-sustained-mixed-workload:scaleup` with
`manageDocker=true`, `dockerCleanup=reset`, one `mixed1600` sample, local
Conversation loadgen, `identitySessionDbWriteConcurrency=0`, unlogged Identity
session table persistence, and the same Conversation/Teaching settings as P72.

Changed Identity settings:

```text
P73 fanout constant pool: --identity-gateway-count 15 --identity-session-db-max-conns 8
P73 pool12:               --identity-gateway-count 12 --identity-session-db-max-conns 12
P73 baseline rerun:       --identity-gateway-count 12 --identity-session-db-max-conns 10
```

## Results

| Run | Status | Identity workers | Pool per worker | Identity total pool | System P99 ms | Identity P99 ms | Conversation P99 ms | Teaching P99 ms | Dominant phase | Revoke slowest step P99 ms | Revoke pool acquire ms | Revoke save avg ms | Revoke own avg ms | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|
| P72 prior baseline | PASSED | 12 | 10 | 120 | 702.06 | 702.06 | 238.44 | 509 | revokeCycle | 402.66 | 1615378.13 | 234.4 | 317.32 | 0 |
| P73 fanout constant pool | PASSED | 15 | 8 | 120 | 725.71 | 725.71 | 231.2 | 383 | revokeCycle | 404.42 | 1647206.21 | 251.79 | 310.44 | 0 |
| P73 pool12 | PASSED | 12 | 12 | 144 | 709.57 | 709.57 | 255.45 | 438 | revokeCycle | 399.88 | 1595955.96 | 242.53 | 311.82 | 0 |
| P73 baseline rerun | PASSED | 12 | 10 | 120 | 678.38 | 678.38 | 230.26 | 540 | revokeCycle | 365.03 | 1532842.65 | 226.94 | 296.32 | 0 |

## Evidence Files

- `reports/system-sustained-mixed-workload-scaleup.p73-identity-fanout-pool-constant-mixed1600.json`
- `reports/system-sustained-mixed-workload-scaleup.p73-identity-pool12-mixed1600.json`
- `reports/system-sustained-mixed-workload-scaleup.p73-identity-baseline-rerun-mixed1600.json`

Each top-level file has its per-step and child workload reports under the same
prefix.

## Interpretation

- `15 x pool8` improved some non-revoke Identity phases, but it did not improve
  the controlling `revokeCycle` tail. System P99 worsened versus both the P72
  baseline and the same-run baseline rerun.
- `12 x pool12` slightly reduced revoke-cycle pool acquire time versus P72, but
  it did not beat the same-run `12 x pool10` baseline and it consumes more
  PgBouncer headroom.
- The same-run `12 x pool10` baseline was the best measured run in P73.
- Current evidence does not justify increasing Identity worker count,
  per-worker pool size, PgBouncer limits, or Identity write concurrency defaults.
- The remaining bottleneck should be treated as Identity session write-path
  behavior under revoke-heavy load, not as a simple configuration limit.

## Verification

```text
P73 generated JSON parse check
P73 generated report secret scan
Docker residual container check
git diff --check
```

## Next Action

Keep the current P55/P72 Identity system shape: `12 workers x pool10`,
`identitySessionDbWriteConcurrency=0`, unlogged session table persistence, and
PgBouncer max DB connections at `180`.

The next optimization slice should target Identity revoke/session write
behavior with a code-level hypothesis or deeper database evidence. A safe next
probe is to compare the SQL and timing profile for the `revokeCycle` login and
delete operations under a narrowed Identity-only benchmark before changing
whole-system configuration.
