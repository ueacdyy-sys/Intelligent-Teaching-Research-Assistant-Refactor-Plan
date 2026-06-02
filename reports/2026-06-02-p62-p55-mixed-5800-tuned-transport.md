# P62 P55 Mixed 5800 Tuned Transport

## Summary

P61 showed `mixed5800` failed with 62 `conversation_write` connection-refused
errors when the shared conversation transport used `400/100` max/warm
connections per gateway target. This slice reran the same workload with a lower
conversation/shared transport profile, while keeping the P55 Identity shape
unchanged.

Result: PASS. `mixed5800` completed with zero errors. Max P99 was `2853.59ms`,
which is still under the current 3000ms guardrail but has little headroom.

## Command

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p55-mixed-5800-tuned-transport.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p55-mixed-5800-tuned-transport --profile SUSTAINED_SCALEUP_P55_MIXED_5800_TUNED_TRANSPORT --manage-docker true --docker-cleanup reset --stop-on-failure true --steps mixed5800:5800:11600:5800:11600:290:580 --samples 1 --sample-interval-ms 0 --identity-gateway-count 12 --conversation-gateway-count 16 --identity-session-db-max-conns 10 --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 64 --max-conns-per-host 300 --warm-connections-per-host 75 --identity-max-conns-per-host 150 --identity-warm-connections-per-host 150 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 16 --identity-ingress-max-conns-per-host 40 --identity-ingress-warm-connections-per-host 16 --timeout 2400s --startup-timeout-ms 180000 --max-p99-ms 3000 --max-p99-drift-ms 1000
```

## Delta From P61

Only the shared conversation/client transport changed:

```text
P61: maxConnsPerHost=400, warmConnectionsPerHost=100 -> FAILED, 62 errors
P62: maxConnsPerHost=300, warmConnectionsPerHost=75  -> PASSED, 0 errors
```

Identity overrides stayed fixed:

```text
identityMaxConnsPerHost=150
identityWarmConnectionsPerHost=150
identityIngressCount=16
identityIngressMaxConnsPerHost=40
identityIngressWarmConnectionsPerHost=16
```

## Reports

- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-5800-tuned-transport.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-5800-tuned-transport.1-mixed5800.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-5800-tuned-transport.1-mixed5800.1.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-5800-tuned-transport.1-mixed5800.1.identity-http.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-5800-tuned-transport.1-mixed5800.1.conversation-write.json`
- matching teaching, knowledge, and AI admission child reports

## Result

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Identity P99 | Conversation P99 | Teaching P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mixed5800 | PASSED/PASSED | 5800 | 5800 | 290 | 2853.59ms | 2853.59ms | 470.75ms | 1816ms | 0 |

Conversation timing after tuning:

```text
conversation_write p99 latency: 470.75ms
server timing p99: 92.87ms
db.acquire p99: 0ms
db.batch_wait p99: 65ms
db.insert p99: 72.62ms
client/server gap p99: 400.5ms
```

## Identity Reading

Identity is now the clear guardrail risk:

| Phase | P95 | P99 | Errors | RPS |
| --- | ---: | ---: | ---: | ---: |
| passwordLogin | 1472.04ms | 1618.02ms | 0 | 4036.92 |
| principalLookup | 1320.11ms | 1421.32ms | 0 | 4968.32 |
| refreshRotation | 1354.61ms | 1518.65ms | 0 | 4731.59 |
| revokeCycle | 2817.62ms | 2853.59ms | 0 | 2079.37 |

Gateway DB pool queue signals:

| Phase | Acquire count delta | Acquire duration delta | Empty acquire count delta |
| --- | ---: | ---: | ---: |
| passwordLogin | 11600 | 5260330.35ms | 11588 |
| principalLookup | 11600 | 2812097.28ms | 11187 |
| refreshRotation | 11600 | 3493201.3ms | 11300 |
| revokeCycle | 34800 | 12057006.38ms | 34680 |

## Cleanup

The runner used `--docker-cleanup reset`. A post-run Docker check found no
`ita-identity-session` containers remaining.

## Interpretation

P61's failed `mixed5800` was not the hard application capacity limit. It was a
transport/listener surge problem in the conversation write path under the
`400/100` client transport. Lowering the shared conversation transport to
`300/75` removed the 62 connection-refused errors and improved conversation P99.

The new practical boundary is Identity latency headroom. At `mixed5800`, the
system passes but has only about 146ms of margin below the 3000ms guardrail.

Do not promote this as official full-system ultra-concurrency support. It is
single-sample exploratory evidence and still lacks root workflow sustained SLO
coverage.

## Next Step

Stop increasing concurrency as the main strategy until Identity revoke-cycle
pool queueing is reduced. A `mixed6200` overdrive run can confirm the guardrail
edge, but the engineering fix should target Identity gateway-local session DB
queueing before collecting multi-sample promotion evidence.
