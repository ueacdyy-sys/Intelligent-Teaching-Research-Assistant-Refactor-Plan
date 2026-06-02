# P67 System Identity Session Persistence Profile

## Summary

P67 added system-level plumbing for the Identity session table persistence
profile after P66 showed the full mixed workload max P99 had moved back to
Identity `revokeCycle`.

The system mixed, sustained, and scale-up runners now accept
`--identity-session-db-session-table-persistence logged|unlogged`, pass it to
the Identity HTTP child benchmark as `--session-db-session-table-persistence`,
and record the selected profile in every rollup `databaseProfile`.

Result: the P67 `mixed5800` rerun with `unlogged` session table persistence
passed with zero errors and reduced the system max P99 from P66 `2217.59ms` to
`2100.79ms`. This is useful configuration evidence, but it does not remove
Identity `revokeCycle` as the current max-P99 bottleneck.

## SDD

- `docs/sdd/0160-system-scaleup-identity-session-persistence-profile.md`

## Focused Tests

```powershell
node --test tools\run-system-mixed-workload-benchmark.test.mjs tools\run-system-sustained-mixed-workload.test.mjs tools\run-system-sustained-mixed-workload-scaleup.test.mjs
```

Result: 26 passed, 0 failed.

## Smoke Command

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-smoke.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-smoke --profile SUSTAINED_SCALEUP_P67_SESSION_PERSISTENCE_SMOKE --manage-docker true --docker-cleanup reset --stop-on-failure true --steps smoke:2:4:4:8:2:4 --samples 1 --sample-interval-ms 0 --identity-gateway-count 2 --conversation-gateway-count 1 --identity-session-db-max-conns 4 --identity-session-db-session-table-persistence unlogged --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 8 --max-conns-per-host 8 --warm-connections-per-host 2 --identity-max-conns-per-host 8 --identity-warm-connections-per-host 2 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 2 --identity-ingress-max-conns-per-host 4 --identity-ingress-warm-connections-per-host 2 --timeout 180s --startup-timeout-ms 120000 --max-p99-ms 3000 --max-p99-drift-ms 500
```

Smoke result:

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| smoke | PASSED/PASSED | 2 | 4 | 2 | 29ms | 0 |

The smoke proved that `unlogged` is recorded in the scale-up rollup, sustained
step, mixed sample, and Identity child report. The mixed child command also
contains `--session-db-session-table-persistence unlogged`.

## Mixed5800 Command

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-mixed-5800.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-mixed-5800 --profile SUSTAINED_SCALEUP_P67_SESSION_PERSISTENCE_MIXED_5800 --manage-docker true --docker-cleanup reset --stop-on-failure true --steps mixed5800:5800:11600:5800:11600:290:580 --samples 1 --sample-interval-ms 0 --identity-gateway-count 12 --conversation-gateway-count 16 --identity-session-db-max-conns 10 --identity-session-db-session-table-persistence unlogged --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 64 --max-conns-per-host 300 --warm-connections-per-host 75 --identity-max-conns-per-host 150 --identity-warm-connections-per-host 150 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 16 --identity-ingress-max-conns-per-host 40 --identity-ingress-warm-connections-per-host 16 --timeout 2400s --startup-timeout-ms 180000 --max-p99-ms 3000 --max-p99-drift-ms 1000
```

## Mixed5800 Reports

- `reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-mixed-5800.json`
- `reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-mixed-5800.1-mixed5800.json`
- `reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-mixed-5800.1-mixed5800.1.json`
- `reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-mixed-5800.1-mixed5800.1.identity-http.json`
- `reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-mixed-5800.1-mixed5800.1.conversation-write.json`
- `reports/system-sustained-mixed-workload-scaleup.p67-session-persistence-mixed-5800.1-mixed5800.1.teaching-archive.json`
- matching knowledge retrieval and AI admission child reports

## Mixed5800 Result

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Identity P99 | Conversation P99 | Teaching P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mixed5800 | PASSED/PASSED | 5800 | 5800 | 290 | 2100.79ms | 2100.79ms | 731.78ms | 1637ms | 0 |

Identity phase P99:

| Phase | P66 logged P99 | P67 unlogged P99 | P67 errors |
| --- | ---: | ---: | ---: |
| passwordLogin | 1707.63ms | 1378.62ms | 0 |
| principalLookup | 1394.88ms | 1526.68ms | 0 |
| refreshRotation | 1425.4ms | 1599.73ms | 0 |
| revokeCycle | 2217.59ms | 2100.79ms | 0 |

Teaching phase P99:

| Phase | P66 P99 | P67 P99 | P67 errors |
| --- | ---: | ---: | ---: |
| createArchiveItem | 1139ms | 1637ms | 0 |
| createQuizSubmission | 1149ms | 1276ms | 0 |
| listArchiveItems | 1360ms | 947ms | 0 |

## Comparison

| Evidence | Status | Session table | Max P99 | Identity P99 | Conversation P99 | Teaching P99 | Errors |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| P65 mixed5800 bearer affinity | PASSED | not recorded | 2413ms | 2291.47ms | 856.05ms | 2413ms | 0 |
| P66 mixed5800 teaching fast insert | PASSED | not recorded | 2217.59ms | 2217.59ms | 883.78ms | 1360ms | 0 |
| P67 mixed5800 session persistence | PASSED | unlogged | 2100.79ms | 2100.79ms | 731.78ms | 1637ms | 0 |

## Interpretation

The `unlogged` Identity session table profile helps a little in the full mixed
shape, especially on password login, but it is not a decisive fix. `revokeCycle`
still owns the system max P99 at `2100.79ms`, so the remaining practical
bottleneck is still the Identity write path and its DB queue behavior under the
mixed workload.

This result should not be promoted as whole-system ultra-concurrency support.
It is single-sample scale-up evidence with useful configuration attribution.

## Verification

- `node --test tools\run-system-mixed-workload-benchmark.test.mjs tools\run-system-sustained-mixed-workload.test.mjs tools\run-system-sustained-mixed-workload-scaleup.test.mjs`
- `npm run verify:structure`
- `npm run quality`
- P67 smoke: PASSED, 0 errors, `identitySessionTablePersistence=unlogged`
- P67 `mixed5800`: PASSED, 0 errors, `identitySessionTablePersistence=unlogged`
- Secret scan over P67 JSON evidence found no local secret value or database URL
- Post-run Docker check found no `ita-identity-session` containers remaining

## Next Step

The next optimization slice should target Identity `revokeCycle` write queueing
directly. Candidate directions:

- profile `saveSession` plus `revokeOwnSession` under the P67 full mixed shape;
- test a bounded revoke/write concurrency profile before changing semantics;
- keep the public session contract unchanged and avoid deleting required writes
  just to improve benchmark numbers.
