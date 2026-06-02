# P59 P55 Mixed High Scale-Up

## Summary

This slice raised the P55 mixed scale-up ladder from the P58 moderate range to
`mixed2400` and `mixed3200`, still using the same 180-connection PgBouncer
candidate and the same Identity ingress shape.

Result: PASS. Both steps passed with zero errors. The highest observed max P99
was `1490.2ms` at `mixed3200`.

This is stronger exploratory evidence, but it is still not a full-system
capacity promotion because it uses one sample per step and does not cover root
workflow runtime SLO depth.

## Command

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p55-mixed-high.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p55-mixed-high --profile SUSTAINED_SCALEUP_P55_MIXED_HIGH --manage-docker true --docker-cleanup reset --stop-on-failure true --steps mixed2400:2400:4800:2400:4800:120:240,mixed3200:3200:6400:3200:6400:160:320 --samples 1 --sample-interval-ms 0 --identity-gateway-count 12 --conversation-gateway-count 16 --identity-session-db-max-conns 10 --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 64 --max-conns-per-host 192 --warm-connections-per-host 48 --identity-max-conns-per-host 150 --identity-warm-connections-per-host 150 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 16 --identity-ingress-max-conns-per-host 40 --identity-ingress-warm-connections-per-host 16 --timeout 1200s --startup-timeout-ms 180000 --max-p99-ms 3000 --max-p99-drift-ms 1000
```

## Runtime Shape

```text
Identity gateway workers: 12
Identity session DB pool per worker: 10
Identity total session pool: 120
Identity ingress workers: 16
Conversation gateway workers: 16
Conversation DB pool per worker: 1
Teaching DB pool: 1
Hot-path pool sum: 137
PgBouncer candidate cap: 180
```

## Reports

- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-high.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-high.1-mixed2400.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-high.2-mixed3200.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-high.1-mixed2400.1.identity-http.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-high.2-mixed3200.1.identity-http.json`
- matching conversation, teaching, knowledge, and AI admission child reports

## Result

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Identity P99 | Conversation P99 | Teaching P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mixed2400 | PASSED/PASSED | 2400 | 2400 | 120 | 1216.94ms | 1216.94ms | 291.68ms | 816ms | 0 |
| mixed3200 | PASSED/PASSED | 3200 | 3200 | 160 | 1490.2ms | 1490.2ms | 562.68ms | 1040ms | 0 |

## Identity Phase Reading

The controlling tail remains Identity `revokeCycle`:

| Step | Phase | P95 | P99 | Errors | RPS |
| --- | --- | ---: | ---: | ---: | ---: |
| mixed2400 | revokeCycle | 1180.84ms | 1216.94ms | 0 | 2091.66 |
| mixed3200 | revokeCycle | 1443.16ms | 1490.2ms | 0 | 2184.97 |

Gateway DB pool queue signals:

| Step | Phase | Acquire count delta | Acquire duration delta | Empty acquire count delta |
| --- | --- | ---: | ---: | ---: |
| mixed2400 | revokeCycle | 14400 | 4730187.3ms | 14280 |
| mixed3200 | revokeCycle | 19200 | 6163939.71ms | 19080 |

The high ladder still passes, but the pool queue signal is large enough that
the next limit search should focus on Identity revoke-cycle queueing, not on
conversation write throughput.

## Cleanup

The runner used `--docker-cleanup reset`. A post-run Docker check found no
`ita-identity-session` containers remaining.

## Interpretation

The current P55 shape has meaningful headroom beyond the previous moderate
run. At one sample per step, it passed mixed Identity+conversation concurrency
of `3200 + 3200` plus teaching concurrency `160`.

Do not promote this as full-system ultra-concurrency. The remaining blockers are
still valid:

- one sample per step is not sustained depth;
- root workflow runtime SLO review is not passing;
- interactive tail latency for real root workflows is not fully covered;
- Identity revoke-cycle DB pool queueing is already the dominant bottleneck.

## Next Step

Run one `mixed4400` step only after confirming machine headroom and Docker
cleanup. If `mixed4400` passes below the current 3000ms guardrail, the next
engineering step should not be increasing concurrency again; it should be
reducing Identity revoke-cycle pool queueing and then rerunning sustained
multi-sample evidence.
