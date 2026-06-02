# P58 P55 Mixed Moderate Scale-Up

## Summary

This slice ran a moderate Docker-managed mixed sustained scale-up using the P55
Identity candidate shape and the 180-connection PgBouncer runtime. The goal was
to move beyond wiring smoke and test whether read/write mixed load shows a
clear bottleneck before attempting the larger 4400 Identity candidate.

Result: PASS. Both `mixed800` and `mixed1600` passed with zero errors.

This is still exploratory evidence: one sample per step, no root workflow
runtime SLO promotion, and no sustained multi-sample depth.

## Command

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p55-mixed-moderate.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p55-mixed-moderate --profile SUSTAINED_SCALEUP_P55_MIXED_MODERATE --manage-docker true --docker-cleanup reset --stop-on-failure true --steps mixed800:800:1600:800:1600:40:80,mixed1600:1600:3200:1600:3200:80:160 --samples 1 --sample-interval-ms 0 --identity-gateway-count 12 --conversation-gateway-count 16 --identity-session-db-max-conns 10 --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 64 --max-conns-per-host 128 --warm-connections-per-host 32 --identity-max-conns-per-host 150 --identity-warm-connections-per-host 150 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 16 --identity-ingress-max-conns-per-host 40 --identity-ingress-warm-connections-per-host 16 --timeout 900s --startup-timeout-ms 180000 --max-p99-ms 3000 --max-p99-drift-ms 1000
```

## Runtime Shape

```text
Identity gateway workers: 12
Identity session DB pool per worker: 10
Identity total session pool: 120
Identity ingress workers: 16
Identity client transport: 150 max/warm per ingress target
Identity ingress upstream transport: 40 max, 16 warm per gateway target
Conversation gateway workers: 16
Conversation DB pool per worker: 1
Teaching DB pool: 1
PgBouncer candidate cap: 180
Hot-path pool sum: 137
```

## Reports

- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-moderate.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-moderate.1-mixed800.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-moderate.2-mixed1600.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-moderate.1-mixed800.1.identity-http.json`
- `reports/system-sustained-mixed-workload-scaleup.p55-mixed-moderate.2-mixed1600.1.identity-http.json`
- matching conversation, teaching, knowledge, and AI admission child reports

## Result

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Identity P99 | Conversation P99 | Teaching P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mixed800 | PASSED/PASSED | 800 | 800 | 40 | 568.58ms | 568.58ms | 110.98ms | 233ms | 0 |
| mixed1600 | PASSED/PASSED | 1600 | 1600 | 80 | 841.72ms | 841.72ms | 183.43ms | 536ms | 0 |

## Identity Phase Reading

Identity remains the controlling tail at this scale. In `mixed1600`, the slowest
Identity phase was `revokeCycle`:

| Step | Phase | P95 | P99 | Errors | RPS |
| --- | --- | ---: | ---: | ---: | ---: |
| mixed800 | revokeCycle | 541.73ms | 568.58ms | 0 | 1609.75 |
| mixed1600 | revokeCycle | 828.62ms | 841.72ms | 0 | 1998.27 |

Gateway DB pool queue signals for Identity:

| Step | Phase | Acquire count delta | Acquire duration delta | Empty acquire count delta |
| --- | --- | ---: | ---: | ---: |
| mixed800 | revokeCycle | 4800 | 610348.65ms | 4680 |
| mixed1600 | revokeCycle | 9600 | 2149824.13ms | 9480 |

The moderate run improves confidence that the P55 Identity shape works in a
mixed system, but it also confirms the next bottleneck is still Identity
gateway-local DB pool queueing under revoke-heavy phases.

## Cleanup

The runner used `--docker-cleanup reset`. A post-run Docker check found no
`ita-identity-session` containers remaining.

## Interpretation

The system can pass this moderate mixed read/write scale-up shape with zero
errors and sub-1s max P99, but this is not enough to claim ultra-high
concurrency:

- only one sample per step;
- not enough sustained depth;
- root workflow runtime SLO review remains blocked;
- interactive tail latency and full workflow coverage are not yet proven;
- higher mixed steps have not been tested.

## Next Step

Run the next ladder (`mixed2400`, then `mixed3200`) with the same P55 Identity
shape. If that passes, use `mixed4400` only after checking machine headroom and
Docker cleanup, because the current bottleneck signal is already visible in
Identity revoke-cycle pool queueing.
