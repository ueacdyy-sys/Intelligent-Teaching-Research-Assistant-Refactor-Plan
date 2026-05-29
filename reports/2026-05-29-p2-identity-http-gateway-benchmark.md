# P2 Identity HTTP Gateway Benchmark

## Decision

Identity And Access now has a client-facing HTTP benchmark path. It starts the real Go gateway with PostgreSQL sessions routed through the identity-only PgBouncer runtime and measures password login, principal lookup, refresh rotation, and revoke cycle behavior over HTTP.

## Benchmark Contract

- Command: `go run ./services/identity-access-gateway/cmd/httpbench`
- Runner: `npm run bench:identity-http:pgbouncer`
- Default gateway URL: `http://127.0.0.1:18100`
- Default report: `reports/identity-http-benchmark.current.json`
- Default concurrency: `64`
- Default operations per phase: `300`
- Gateway session DB pool: `16`

## Verification

- Unit gate: `go test ./services/identity-access-gateway/cmd/httpbench`
- Debug evidence: a manual gateway start against PgBouncer became healthy after a long `go run` startup. The runner now waits up to `120000ms` by default before failing health.
- Debug evidence: Windows `go run` left the compiled `gateway.exe` child listening after killing only the parent. The runner now stops the process tree with `taskkill /T /F` on Windows.
- Gate: `npm test` passes with the HTTP benchmark command tests in the root Docker-free suite.
- Runtime gates: `npm run audit:identity-session-runtime`, `npm run audit:identity-access`, `npm run budget:connections:direct-limited`, and `npm run budget:connections:pgbouncer` pass.

## Runtime Evidence

Run:

```powershell
npm run perf:identity-session:up
npm run bench:identity-http:pgbouncer
npm run perf:identity-session:down
```

Observed HTTP gateway results through PgBouncer:

| Report | Concurrency | Password login P95 | Principal lookup P95 | Refresh rotation P95 | Revoke cycle P95 | Revoke cycle RPS | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `identity-http-benchmark.current.json` | 64 | 134.48ms | 43.37ms | 40.31ms | 82.77ms | 1028.79 | 0 |
| `identity-http-benchmark.concurrency128.json` | 128 | 58.70ms | 32.40ms | 76.06ms | 114.85ms | 1177.07 | 0 |
| `identity-http-benchmark.concurrency256.json` | 256 | 99.18ms | 56.93ms | 119.57ms | 241.86ms | 1071.55 | 0 |

Post self-revoke fast-path result:

| Report | Concurrency | Password login P95 | Principal lookup P95 | Refresh rotation P95 | Revoke cycle P95 | Revoke cycle RPS | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency256-fast-revoke.json` | 256 | 96.09ms | 65.34ms | 131.31ms | 199.53ms | 1291.23 | 0 |

The self-revoke fast path reduced the 256-concurrency revoke-cycle P95 by 42.33ms, from 241.86ms to 199.53ms, and raised revoke-cycle throughput from 1071.55 RPS to 1291.23 RPS.

Cleanup evidence after the post-optimization run:

- No listener remained on port `18100`.
- `identity_sessions`: total rows `4664`, active rows `0`.
- PgBouncer showed no waiting clients: `cl_active=0`, `cl_waiting=0`, `sv_idle=16`.

## Next Evidence

The gateway is not failing under 256 concurrent client workers on this identity-only profile. The next bottleneck is write-heavy mixed workflows, especially refresh and revoke cycles, not principal reads. Further optimization should focus on reducing write amplification and measuring real module flows before adding cache complexity.
