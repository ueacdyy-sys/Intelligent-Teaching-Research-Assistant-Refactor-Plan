# P77 Principal JSON Elision Mixed1600 Verification

## Context

P76 removed duplicated column-backed timestamps from new
`principal_json` session writes. The P76 HTTP smoke proved the Identity runtime
still works with column-backed `issued_at` and `expires_at`, but that smoke was
intentionally narrow.

P77 verifies the same code change under the existing same-shape `mixed1600`
system profile used by P73 and P74. This is performance evidence only. It does
not change root requirements, default worker limits, PgBouncer limits, root SLO
promotion status, or any ultra-concurrency claim.

## Source Reports

- `reports/system-sustained-mixed-workload-scaleup.p77-principal-json-elision-mixed1600.json`
- `reports/system-sustained-mixed-workload-scaleup.p77-principal-json-elision-mixed1600.1-mixed1600.1.identity-http.json`
- `reports/system-sustained-mixed-workload-scaleup.p77-principal-json-elision-mixed1600.1-mixed1600.1.conversation-write.json`
- `reports/system-sustained-mixed-workload-scaleup.p77-principal-json-elision-mixed1600.1-mixed1600.1.teaching-archive.json`
- `reports/system-sustained-mixed-workload-scaleup.p77-principal-json-elision-mixed1600.1-mixed1600.1.knowledge-retrieval.json`
- `reports/system-sustained-mixed-workload-scaleup.p77-principal-json-elision-mixed1600.1-mixed1600.1.ai-worker-admission.json`

## Profile

The P77 run keeps the same comparison shape as P73/P74:

| Setting | Value |
|---|---:|
| Identity logical concurrency | 1600 |
| Identity operations per phase | 3200 |
| Conversation logical concurrency | 1600 |
| Conversation operations | 3200 |
| Teaching archive concurrency | 80 |
| Teaching archive operations | 160 |
| Identity gateway workers | 12 |
| Identity session DB max connections per worker | 10 |
| Identity ingress workers | 16 |
| Identity ingress upstream gateways | 12 |
| Identity session write concurrency | 0 |
| Identity session table persistence | unlogged |
| Conversation gateway workers | 16 |
| Conversation DB max connections per worker | 1 |
| Teaching DB max connections | 1 |
| Conversation write batch size | 64 |
| Conversation load generator | local Go |
| Docker cleanup | reset |

## Mixed1600 Result

| Run | Status | System P95 ms | System P99 ms | Identity P99 ms | Identity RPS | Conversation P99 ms | Conversation RPS | Teaching P99 ms | Dominant Identity phase | Errors |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| P73 baseline rerun | PASSED | 641.78 | 678.38 | 678.38 | 2637.50 | 230.26 | 12089.13 | 540 | revokeCycle | 0 |
| P74 BRIN | PASSED | 654.30 | 685.19 | 685.19 | 2559.58 | 336.24 | 8734.40 | 321 | revokeCycle | 0 |
| P77 principal JSON elision | PASSED | 625.31 | 657.79 | 657.79 | 2648.78 | 281.98 | 10483.46 | 347 | revokeCycle | 0 |

P77 improved system P99 by `3.04%` versus the P73 same-run baseline and by
`4.00%` versus P74. The improvement is useful but small enough to treat as
single-sample evidence, not as a capacity promotion.

## Identity Phase Result

| Run | Password login P99 ms | Principal lookup P99 ms | Refresh rotation P99 ms | Revoke cycle P99 ms | Revoke slowest step | Revoke slowest step P99 ms |
|---|---:|---:|---:|---:|---|---:|
| P73 baseline rerun | 621.98 | 460.49 | 373.37 | 678.38 | revoke | 365.03 |
| P74 BRIN | 641.01 | 435.87 | 392.17 | 685.19 | revoke | 385.95 |
| P77 principal JSON elision | 554.69 | 449.13 | 382.34 | 657.79 | revoke | 384.84 |

The dominant phase remains `revokeCycle`. P77 reduces total Identity tail
latency versus P73/P74, but the slowest step is still revoke-side write work.

## Operation-Level Evidence

| Run | Operation | Count | Average elapsed ms |
|---|---|---:|---:|
| P73 baseline rerun | `passwordLogin.saveSession` | 3200 | 255.63 |
| P74 BRIN | `passwordLogin.saveSession` | 3200 | 309.07 |
| P77 principal JSON elision | `passwordLogin.saveSession` | 3200 | 262.18 |
| P73 baseline rerun | `revokeCycle.saveSession` | 3200 | 226.94 |
| P74 BRIN | `revokeCycle.saveSession` | 3200 | 237.81 |
| P77 principal JSON elision | `revokeCycle.saveSession` | 3200 | 225.12 |
| P73 baseline rerun | `revokeCycle.revokeOwnSession` | 3200 | 296.32 |
| P74 BRIN | `revokeCycle.revokeOwnSession` | 3200 | 304.38 |
| P77 principal JSON elision | `revokeCycle.revokeOwnSession` | 3200 | 294.07 |

The JSON timestamp elision helps `saveSession` relative to P74 and is roughly
neutral to slightly positive versus the P73 same-run baseline. It does not
remove the revoke bottleneck: `revokeCycle.revokeOwnSession` remains the
slowest reported session operation in the controlling phase.

## Covered Architecture Modules

This mixed system run exercised these architecture modules:

| Module slice | Status in P77 | Key metric |
|---|---|---:|
| Identity And Access | PASSED | P99 657.79ms, 0 errors |
| Research Conversation Write | PASSED | P99 281.98ms, 0 errors |
| Teaching Archive And Quiz | PASSED | P99 347ms, 0 errors |
| Knowledge Retrieval | READY | P95 query plan 2.55ms, 0 errors |
| AI Worker Admission | READY | admission audit READY, 0 errors |

## Interpretation

- P76's code-level write-path change survives the full `mixed1600` system
  profile with zero errors.
- The measured system P99 improved from `678.38ms` to `657.79ms` versus the P73
  same-run baseline.
- The bottleneck did not move away from Identity. `revokeCycle` still owns the
  system max P99, and `revokeOwnSession` is still the slowest session operation
  in that phase.
- Current evidence supports keeping the P76 optimization.
- Current evidence does not justify raising worker counts, pool sizes, write
  concurrency, PgBouncer limits, or claiming ultra-high concurrency support.

## Cleanup

The managed Docker Identity session stack was reset after the run. Follow-up
container inspection found no new `identity-session` containers. Only older
exited `ita-*` containers from prior work remained.

## Next Action

Continue with a narrow Identity revoke write-path slice. The next useful
hypothesis should target `revokeOwnSession` SQL/index/transaction work or add
deeper database timing attribution around that operation before changing system
configuration again.
