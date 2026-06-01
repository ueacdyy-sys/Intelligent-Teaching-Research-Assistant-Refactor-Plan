# P50 Conversation WSL Worker Fanout Profile

## Summary

This slice used SDD 0131 to test whether increasing Research conversation
gateway worker fanout improves the WSL2 high-concurrency write profile.

The controlled variables stayed fixed:

- Ubuntu WSL2 Go load generator through `172.28.160.1`
- PgBouncer transaction pooling
- `DB_MAX_CONNS=1` per gateway worker
- `CONVERSATION_WRITE_BATCH_SIZE=64`
- `CONVERSATION_WRITE_BATCH_DELAY_MS=0`
- local secret `ueacd`

Result: do not increase the recommended conversation worker fanout above 16 for
this local performance profile. Higher fanout reduced per-worker connection
pressure, but it worsened end-to-end tail latency and, at 32 workers with 30000
concurrency, introduced connection reset errors.

## Evidence

### 20000 Concurrency

| Report | Workers | DB conns total | Status | RPS | P95 ms | P99 ms | Server P99 ms | Gap P99 ms | DB acquire P99 ms | DB insert P99 ms | Errors | Max current conns per worker |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `conversation-write-http-benchmark.wsl-direct16-concurrency20000-batched64.json` | 16 | 16 | PASSED | 24621.12 | 920.02 | 1077.51 | 79.53 | 1041.31 | 0.00 | 46.42 | 0 | 850-1694 |
| `conversation-write-http-benchmark.wsl-direct24-concurrency20000-batched64.json` | 24 | 24 | PASSED | 20524.68 | 1487.26 | 1687.76 | 158.73 | 1656.25 | 0.00 | 99.25 | 0 | 641-1127 |
| `conversation-write-http-benchmark.wsl-direct32-concurrency20000-batched64.json` | 32 | 32 | PASSED | 19522.92 | 1323.51 | 1530.92 | 185.47 | 1464.15 | 0.00 | 110.58 | 0 | 380-625 |

### 30000 Concurrency

| Report | Workers | DB conns total | Status | RPS | P95 ms | P99 ms | Server P99 ms | Gap P99 ms | DB acquire P99 ms | DB insert P99 ms | Errors | Max current conns per worker |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `conversation-write-http-benchmark.wsl-direct16-concurrency30000-batched64.json` | 16 | 16 | PASSED | 21955.10 | 1536.46 | 1795.33 | 198.85 | 1772.63 | 0.00 | 112.64 | 0 | 1478-3159 |
| `conversation-write-http-benchmark.wsl-direct24-concurrency30000-batched64.json` | 24 | 24 | PASSED | 19965.78 | 2119.85 | 2329.34 | 150.48 | 2289.15 | 0.00 | 84.19 | 0 | 804-1939 |
| `conversation-write-http-benchmark.wsl-direct32-concurrency30000-batched64.json` | 32 | 32 | FAILED | 20348.37 | 2226.45 | 2452.78 | 182.33 | 2378.49 | 0.00 | 102.93 | 6 | 673-1022 |

The 32-worker failure recorded:

```text
read: connection reset by peer
```

Gateway exit codes and signals stayed null for all 32 workers, so this was not
a captured process crash. The failure shape points to host listener, transport,
or scheduling pressure.

## Interpretation

More workers are not better on this desktop profile.

- 24 and 32 workers reduced max current connections per worker.
- 16 workers still delivered the best RPS and P99 at 20000 concurrency.
- 16 workers remained the only zero-error 30000-concurrency profile with the
  best P99 among tested fanouts.
- `db.acquire` P99 stayed at 0ms across the comparisons, so database pool
  acquisition still is not the limiter.

Configuration decision:

- Keep the proposed PgBouncer conversation write gateway budget at 16
  application-side connections for this profile.
- Do not promote 24 or 32 conversation gateway workers.
- Treat 32 workers at 30000 concurrency as a negative fanout probe.

System-design score for this slice: 9/10.

The missing 10/10 evidence is a sustained mixed workload with memory, CPU, and
OS socket counters. For short-burst conversation writes, the fanout decision is
now evidence-backed.

## Verification

Commands run:

```powershell
npm run perf:identity-session:up
docker exec -e PGPASSWORD=ueacd ita-identity-session-postgres psql -U app_user -d intelligent_teaching_assistant -c "TRUNCATE TABLE research_conversations;"
npm run bench:conversation-write:pgbouncer:wsl -- --gateway-count 24 --db-max-conns 1 --write-batch-size 64 --write-batch-delay-ms 0 --agent-api-key ueacd --concurrency 20000 --operations 40000 --max-conns-per-host 0 --warm-connections-per-host 834 --warm-connection-retries 3 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 860 --out reports/conversation-write-http-benchmark.wsl-direct24-concurrency20000-batched64.json --timeout 2400s --startup-timeout-ms 120000
npm run bench:conversation-write:pgbouncer:wsl -- --gateway-count 32 --db-max-conns 1 --write-batch-size 64 --write-batch-delay-ms 0 --agent-api-key ueacd --concurrency 20000 --operations 40000 --max-conns-per-host 0 --warm-connections-per-host 625 --warm-connection-retries 3 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 860 --out reports/conversation-write-http-benchmark.wsl-direct32-concurrency20000-batched64.json --timeout 2400s --startup-timeout-ms 120000
npm run bench:conversation-write:pgbouncer:wsl -- --gateway-count 32 --db-max-conns 1 --write-batch-size 64 --write-batch-delay-ms 0 --agent-api-key ueacd --concurrency 30000 --operations 60000 --max-conns-per-host 0 --warm-connections-per-host 938 --warm-connection-retries 3 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 1300 --out reports/conversation-write-http-benchmark.wsl-direct32-concurrency30000-batched64.json --timeout 3000s --startup-timeout-ms 120000
npm run bench:conversation-write:pgbouncer:wsl -- --gateway-count 24 --db-max-conns 1 --write-batch-size 64 --write-batch-delay-ms 0 --agent-api-key ueacd --concurrency 30000 --operations 60000 --max-conns-per-host 0 --warm-connections-per-host 1250 --warm-connection-retries 3 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 1300 --out reports/conversation-write-http-benchmark.wsl-direct24-concurrency30000-batched64.json --timeout 3000s --startup-timeout-ms 120000
npm run audit:performance-evidence
npm run budget:connections:pgbouncer
npm run quality
docker exec -e PGPASSWORD=ueacd ita-identity-session-postgres psql -U app_user -d intelligent_teaching_assistant -c "TRUNCATE TABLE research_conversations;"
npm run perf:identity-session:down
```

Registry:

- Added `conversation_write_gateway_wsl_worker_fanout_32_negative_30000`.
- Performance evidence registry audit: READY.
- Evidence entries: 58.

Connection budget:

- `npm run budget:connections:pgbouncer`: PASS.
- Planned connections remain 96.
- Safe limit remains 190.
- Conversation write gateway remains 16 application-side connections in the
  proposed PgBouncer profile.

Quality:

- `npm run quality`: PASS.
- Quality gate command steps: 19.
- Node tests: 125 passed.
- Go and Rust tests passed.

Secret scan:

- New higher-fanout benchmark JSON reports contain no raw `ueacd`,
  `postgres://`, or `postgresql://`.

Cleanup:

- `research_conversations` was truncated after the probes.
- Docker performance profile was stopped.
- `docker ps` showed no running containers.
