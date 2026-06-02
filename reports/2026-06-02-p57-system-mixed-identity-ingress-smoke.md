# P57 System Mixed Identity Ingress Smoke

## Summary

After P56 added Identity ingress profile wiring to the mixed workload runner
stack, this slice ran a tiny Docker-managed sustained scale-up smoke against the
real runner path. The goal was to prove that the mixed runner can start the
Identity gateway workers, local Identity ingress workers, conversation write
gateway, teaching archive workflow, and read-only readiness audits together.

Result: PASS. This is wiring and runtime sanity evidence only, not a capacity
promotion.

## Command

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.json --step-prefix reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke --profile SUSTAINED_SCALEUP_IDENTITY_INGRESS_SMOKE --manage-docker true --docker-cleanup reset --stop-on-failure true --steps smoke:2:4:4:8:2:4 --samples 1 --sample-interval-ms 0 --identity-gateway-count 2 --conversation-gateway-count 1 --identity-session-db-max-conns 4 --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 8 --max-conns-per-host 8 --warm-connections-per-host 2 --identity-max-conns-per-host 8 --identity-warm-connections-per-host 2 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 2 --identity-ingress-max-conns-per-host 4 --identity-ingress-warm-connections-per-host 2 --timeout 180s --startup-timeout-ms 120000 --max-p99-ms 2000 --max-p99-drift-ms 500
```

## Reports

- `reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.json`
- `reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.1-smoke.json`
- `reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.1-smoke.1.json`
- `reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.1-smoke.1.identity-http.json`
- `reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.1-smoke.1.conversation-write.json`
- `reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.1-smoke.1.teaching-archive.json`
- `reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.1-smoke.1.knowledge-retrieval.json`
- `reports/system-sustained-mixed-workload-scaleup.identity-ingress-smoke.1-smoke.1.ai-worker-admission.json`

## Result

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| smoke | PASSED/PASSED | 2 | 4 | 2 | 24ms | 0 |

Workload P99:

| Workload | Max P99 | Errors |
| --- | ---: | ---: |
| identity_http | 20.37ms | 0 |
| conversation_write | 23.39ms | 0 |
| teaching_archive | 24ms | 0 |
| knowledge_retrieval | n/a | 0 |
| ai_worker_admission | n/a | 0 |

Runner profile:

```json
{
  "identityGatewayCount": 2,
  "identityIngressProfile": {
    "enabled": true,
    "basePort": 19080,
    "workerCount": 2,
    "upstreamGatewayCount": 2,
    "maxConnsPerHost": 4,
    "warmConnectionsPerHost": 2
  },
  "transportProfile": {
    "sharedMaxConnsPerHost": 8,
    "sharedWarmConnectionsPerHost": 2,
    "identityMaxConnsPerHost": 8,
    "identityWarmConnectionsPerHost": 2
  }
}
```

## Cleanup

The runner used `--docker-cleanup reset`. A post-run Docker check found no
`ita-identity-session` containers remaining.

## Interpretation

This smoke proves the new Identity ingress parameters work through the real
mixed sustained scale-up stack. It also proves the rollup report records the
Identity ingress and transport profile at the top level.

It does not prove high concurrency capacity. The run used tiny concurrency and
one sample only. The next evidence step is a larger Docker-managed mixed
scale-up using PgBouncer 180 and the P55 Identity candidate.

## Next Step

Run a moderate mixed scale-up before the full 4400 Identity candidate:

```text
identityGatewayCount=12
identitySessionDbMaxConns=10
identityIngressCount=16
identityMaxConnsPerHost=150
identityIngressMaxConnsPerHost=40
conversation and teaching hot-path pools kept within PgBouncer 180 headroom
```

Keep root SLO promotion blocked until the mixed workload, root workflow runtime
coverage, sustained depth, and interactive tail latency gates all pass.
