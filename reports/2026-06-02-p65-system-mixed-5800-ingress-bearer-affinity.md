# P65 System Mixed 5800 With Identity Bearer Affinity

## Summary

P65 reran the P62-shaped sustained mixed workload after P64 added Identity
ingress bearer affinity. The workload passed with zero errors.

Result: `mixed5800` passed with max P99 `2413ms`, improving the P62 max P99
reading of `2853.59ms` while keeping the same worker, pool, ingress, and shared
transport shape.

This is stronger whole-system scale-up evidence than P62, but it is still a
single-sample sustained scale-up result. Do not promote full-system
ultra-concurrency support until root SLO promotion evidence passes.

## Command

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p65-ingress-bearer-affinity-mixed-5800.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p65-ingress-bearer-affinity-mixed-5800 --profile SUSTAINED_SCALEUP_P65_INGRESS_BEARER_AFFINITY_MIXED_5800 --manage-docker true --docker-cleanup reset --stop-on-failure true --steps mixed5800:5800:11600:5800:11600:290:580 --samples 1 --sample-interval-ms 0 --identity-gateway-count 12 --conversation-gateway-count 16 --identity-session-db-max-conns 10 --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 64 --max-conns-per-host 300 --warm-connections-per-host 75 --identity-max-conns-per-host 150 --identity-warm-connections-per-host 150 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 16 --identity-ingress-max-conns-per-host 40 --identity-ingress-warm-connections-per-host 16 --timeout 2400s --startup-timeout-ms 180000 --max-p99-ms 3000 --max-p99-drift-ms 1000
```

## Reports

- `reports/system-sustained-mixed-workload-scaleup.p65-ingress-bearer-affinity-mixed-5800.json`
- `reports/system-sustained-mixed-workload-scaleup.p65-ingress-bearer-affinity-mixed-5800.1-mixed5800.json`
- `reports/system-sustained-mixed-workload-scaleup.p65-ingress-bearer-affinity-mixed-5800.1-mixed5800.1.json`
- `reports/system-sustained-mixed-workload-scaleup.p65-ingress-bearer-affinity-mixed-5800.1-mixed5800.1.identity-http.json`
- `reports/system-sustained-mixed-workload-scaleup.p65-ingress-bearer-affinity-mixed-5800.1-mixed5800.1.conversation-write.json`
- matching teaching, knowledge, and AI admission child reports

## Result

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Identity P99 | Conversation P99 | Teaching P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mixed5800 | PASSED/PASSED | 5800 | 5800 | 290 | 2413ms | 2291.47ms | 856.05ms | 2413ms | 0 |

Rollup summary:

```text
highestPassedStep=mixed5800
firstBlockedStep=none
totalErrors=0
maxP95=2410ms
maxP99=2413ms
maxP99Drift=0ms
```

## Identity Reading

| Phase | P95 | P99 | Errors | RPS |
| --- | ---: | ---: | ---: | ---: |
| passwordLogin | 1662.17ms | 1752.38ms | 0 | 3653.71 |
| principalLookup | 1287.12ms | 1419.24ms | 0 | 4944.08 |
| refreshRotation | 1316.05ms | 1427.75ms | 0 | 4812.31 |
| revokeCycle | 2253.9ms | 2291.47ms | 0 | 2776.54 |

Gateway DB pool queue signals:

| Phase | Acquire count delta | Acquire duration delta | Access lookup count |
| --- | ---: | ---: | ---: |
| passwordLogin | 11600 | 6241056.97ms | 0 |
| principalLookup | 11600 | 3069085.63ms | 11600 |
| refreshRotation | 11600 | 3236161.51ms | 0 |
| revokeCycle | 23200 | 8819905.96ms | 0 |

The important change is in `revokeCycle`: P65 has `23200 = 11600 * 2` session DB
acquires and zero post-revoke access lookups. P62 had `34800 = 11600 * 3`
acquires in the same phase. The third database operation was removed from this
system-level mixed workload.

## Cross-Module Reading

Conversation write remained healthy:

```text
conversation_write createConversation p99: 856.05ms
server timing p99: 253.08ms
db.acquire p99: 0ms
db.batch_wait p99: 110.37ms
db.insert p99: 159.72ms
client/server gap p99: 761.49ms
```

Teaching archive became the max P99 contributor in this run:

```text
teaching_archive max p95: 2410ms
teaching_archive max p99: 2413ms
teaching_archive total errors: 0
```

## Comparison

| Evidence | Status | Max P99 | Identity revoke P99 | Revoke DB acquire count | Revoke access lookups | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| P62 mixed5800 tuned transport | PASSED | 2853.59ms | 2853.59ms | 34800 | not recorded in rollup | 0 |
| P63 mixed5800 deny cache only | FAILED | 2396ms observed | failed during passwordLogin | n/a | n/a | ingress 502 |
| P65 mixed5800 bearer affinity | PASSED | 2413ms | 2291.47ms | 23200 | 0 | 0 |

## Interpretation

P65 confirms the read/write bottleneck analysis:

- The local deny cache alone was not enough under multi-gateway ingress.
- Bearer affinity lets the revoke and immediate principal check hit the same
  gateway process.
- That removes one session DB operation from every revoke cycle and improves
  Identity revoke-cycle tail latency under the full mixed workload.

The next practical bottleneck is no longer the post-revoke DB read. In this run,
the max P99 came from Teaching Archive at `2413ms`, while Identity revoke-cycle
P99 was `2291.47ms`.

## Capacity Claim Boundary

Do not promote this as official full-system ultra-concurrency support yet.

Reasons:

- It is a single-sample scale-up run.
- Root workflow sustained SLO evidence is still required.
- P65 improves the `mixed5800` boundary but does not prove repeated or
  long-duration stability.
- P63 showed ingress upstream availability can still fail under this pressure,
  so recurrence needs more samples.

## Next Step

Rerun `mixed5800` with at least three samples or run the next root SLO promotion
review shape before increasing concurrency. If it remains stable, investigate
Teaching Archive tail latency because it is now the P65 max P99 contributor.
