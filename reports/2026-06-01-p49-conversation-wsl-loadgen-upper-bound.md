# P49 Conversation WSL Load Generator Upper Bound

## Summary

This slice implemented SDD 0130 and moved the Research conversation write load
generator into Ubuntu WSL2 while keeping the application profile unchanged:

- 16 host-started conversation gateway workers
- 1 application-side PostgreSQL connection per worker
- PgBouncer transaction pooling
- `CONVERSATION_WRITE_BATCH_SIZE=64`
- `CONVERSATION_WRITE_BATCH_DELAY_MS=0`
- WSL Go `httpbench` targeting host gateways through the current WSL default
  gateway, `172.28.160.1`

The default Docker Desktop alias `host.docker.internal` did not reach
host-started Windows gateways from Ubuntu WSL2 on this machine. The smoke run
passed once the benchmark used the WSL default gateway explicitly.

## Evidence

| Report | Runtime | Status | Concurrency | RPS | P95 ms | P99 ms | Server P99 ms | Client/server gap P99 ms | DB acquire P99 ms | DB insert P99 ms | Errors |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `conversation-write-http-benchmark.wsl-runtime-smoke.json` | WSL Go | PASSED | 16 | 648.04 | 32.53 | 33.06 | 31.28 | 6.35 | 3.59 | 18.66 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency5800-batched64.json` | WSL Go | PASSED | 5800 | 19189.67 | 462.07 | 490.92 | 195.99 | 351.43 | 0.00 | 84.00 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency6200-batched64.json` | WSL Go | PASSED | 6200 | 21707.68 | 336.44 | 397.16 | 111.40 | 352.60 | 0.65 | 65.00 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency7000-batched64.json` | WSL Go | PASSED | 7000 | 19720.76 | 573.79 | 621.19 | 98.26 | 568.10 | 0.00 | 63.29 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency8000-batched64.json` | WSL Go | PASSED | 8000 | 22843.17 | 443.15 | 518.15 | 84.61 | 468.71 | 0.32 | 57.58 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency10000-batched64.json` | WSL Go | PASSED | 10000 | 17699.55 | 774.67 | 855.32 | 120.48 | 823.01 | 0.00 | 58.40 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency12000-batched64.json` | WSL Go | PASSED | 12000 | 20680.21 | 755.59 | 829.47 | 125.13 | 779.28 | 0.00 | 71.64 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency15000-batched64.json` | WSL Go | PASSED | 15000 | 20677.35 | 1097.02 | 1192.27 | 126.44 | 1119.10 | 0.00 | 68.55 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency20000-batched64.json` | WSL Go | PASSED | 20000 | 24621.12 | 920.02 | 1077.51 | 79.53 | 1041.31 | 0.00 | 46.42 | 0 |
| `conversation-write-http-benchmark.wsl-direct16-concurrency30000-batched64.json` | WSL Go | PASSED | 30000 | 21955.10 | 1536.46 | 1795.33 | 198.85 | 1772.63 | 0.00 | 112.64 | 0 |

Gateway runtime diagnostics were present for all 16 workers in the high
concurrency reports. At 30000 concurrency, max current connections per gateway
ranged from 1478 to 3159.

## Comparison With Prior Evidence

Prior strongest Windows-local low-tail point:

- report:
  `conversation-write-http-benchmark.direct16-concurrency5800-multi16-pool1-client-unlimited-batched64-delay0.json`
- concurrency: 5800
- RPS: 21969.45
- P99: 349.90ms
- server P99: 64.61ms
- DB acquire P99: 0ms
- errors: 0

Prior Dockerized functional point:

- report:
  `conversation-write-http-benchmark.docker-direct16-concurrency7000-batched64.json`
- concurrency: 7000
- RPS: 5471.43
- P99: 2263.57ms
- server P99: 38.69ms
- DB acquire P99: 0ms
- errors: 0

WSL2 improves the evidence set in two ways:

- It avoids the Windows-local 6200 socket error and passes 6200, 8000, 12000,
  20000, and 30000 concurrency with zero createConversation errors.
- It avoids Docker Desktop's very large throughput penalty. The 8000 WSL run
  reached 22843.17 RPS, versus Dockerized 7000 at 5471.43 RPS.

The prior Windows-local 5800 run still has the best observed low-tail P99. WSL
is the better functional upper-bound tool; Windows-local remains the best
single low-tail datapoint at 5800.

## Interpretation

The database is not the current bottleneck in this profile.

- `db.acquire` P99 stayed at 0 to 0.65ms across all WSL high-concurrency
  probes.
- Server-side P99 stayed below 200ms even at 30000 concurrency.
- The tail is dominated by client/server gap, which reached 1772.63ms at
  30000 concurrency.

Current performance should be described in layers:

- Low-tail current point: 5800 Windows-local at P99 349.90ms remains the
  strongest observed sub-400ms result.
- Strong WSL high-concurrency point: 6200 WSL at P99 397.16ms and 0 errors.
- Practical high-concurrency point: 8000 WSL at P99 518.15ms, 22843.17 RPS,
  and 0 errors.
- Functional short-burst capacity: at least 30000 concurrent conversation
  writes with 0 errors under this WSL2 direct16 profile.
- Not yet proven: sustained long-duration capacity, mixed read/write flows,
  multi-module end-to-end capacity, or a hard failure ceiling above 30000.

System-design score for this performance slice: 9/10.

To reach 10/10, add a sustained 10-30 minute mixed workload with OS counters,
memory snapshots, and a real ingress/load-balancing path. The current evidence
is strong for short-burst conversation writes, but not yet a full-system
production capacity claim.

## Verification

Commands run:

```powershell
npm run test:tools
npm run verify:structure
npm run perf:identity-session:up
docker exec -e PGPASSWORD=ueacd ita-identity-session-postgres psql -U app_user -d intelligent_teaching_assistant -c "TRUNCATE TABLE research_conversations;"
npm run bench:conversation-write:pgbouncer:wsl -- --benchmark-wsl-host 172.28.160.1 --gateway-count 16 --db-max-conns 1 --write-batch-size 64 --write-batch-delay-ms 0 --agent-api-key ueacd --concurrency 30000 --operations 60000 --max-conns-per-host 0 --warm-connections-per-host 1875 --warm-connection-retries 3 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 1300 --out reports/conversation-write-http-benchmark.wsl-direct16-concurrency30000-batched64.json --timeout 3000s --startup-timeout-ms 120000
npm run audit:performance-evidence
npm run quality
docker exec -e PGPASSWORD=ueacd ita-identity-session-postgres psql -U app_user -d intelligent_teaching_assistant -c "TRUNCATE TABLE research_conversations;"
npm run perf:identity-session:down
```

Registry:

- Added `conversation_write_gateway_wsl_loadgen_functional_30000`.
- Performance evidence registry audit: READY.
- Evidence entries: 57.

Quality:

- `npm run quality`: PASS.
- Quality gate command steps: 19.
- Node tests: 125 passed.
- Go and Rust tests passed.

Secret scan:

- New WSL benchmark JSON reports contain no raw `ueacd`, `postgres://`, or
  `postgresql://`.

Cleanup:

- `research_conversations` was truncated after the probes.
- Docker performance profile was stopped.
- `docker ps` showed no running containers.
