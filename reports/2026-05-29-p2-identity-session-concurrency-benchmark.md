# P2 Identity Session Concurrency Benchmark

## Decision

Identity And Access now has a standalone durable session benchmark command. It runs against the identity-only PgBouncer runtime and records latency evidence for access lookup, refresh rotation, and revoke cycles.

## Benchmark Contract

- Command: `go run ./services/identity-access-gateway/cmd/sessionbench`
- Script: `npm run bench:identity-session:pgbouncer`
- Default DSN: `postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable`
- Default report: `reports/identity-session-benchmark.current.json`
- Default concurrency: `64`
- Default operations per phase: `500`
- Default pool max connections: `8`

## Verification

- Unit gate: `go test ./services/identity-access-gateway/cmd/sessionbench`
- Root gate: `npm test`
- Runtime profile audit: `npm run audit:identity-session-runtime`
- Connection budget:
  - direct-limited: planned `64`, safe limit `65`
  - PgBouncer: planned `80`, safe limit `190`

## Runtime Evidence

Sequential benchmark runs against the identity-only PgBouncer profile, with `500` operations per phase:

| Concurrency | Pool max conns | Access lookup P95 | Refresh rotation P95 | Revoke cycle P95 | Access RPS | Refresh RPS | Revoke RPS | Errors |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 | 4 | 43.85ms | 71.37ms | 177.28ms | 1588.94 | 942.79 | 419.26 | 0 |
| 64 | 8 | 24.86ms | 42.47ms | 85.80ms | 2757.73 | 1719.45 | 785.57 | 0 |
| 64 | 16 | 21.88ms | 22.39ms | 46.70ms | 4258.79 | 3225.09 | 1530.51 | 0 |
| 128 | 16 | 100.12ms | 78.38ms | 98.07ms | 2391.00 | 2391.50 | 1431.90 | 0 |
| 256 | 16 | 53.19ms | 86.12ms | 190.88ms | 4662.76 | 2969.85 | 1361.10 | 0 |

The default benchmark report is `reports/identity-session-benchmark.current.json` and now uses pool max conns `8`. The benchmark shows `4` is a real bottleneck. `8` is the best direct-limited default because it keeps the 100-connection profile barely within budget. `16` is the PgBouncer high-concurrency target.

The 128/256 runs show zero errors through PgBouncer. Access lookup does not yet justify a read-through cache as a first migration requirement; the slower and more variable path is the write-heavy revoke cycle. After the 256 run, `identity_sessions` had `0` rows, proving benchmark cleanup, and PgBouncer showed `sv_used=16` for the identity database with no waiting clients.

Commands:

```powershell
npm run perf:identity-session:up
npm run bench:identity-session:pgbouncer
npm run perf:identity-session:down
```

## Next Evidence

Next, run the same benchmark through the HTTP gateway instead of the adapter command, because HTTP decoding, auth headers, and response encoding will be the real client-facing path. Keep read-through principal caching as a later option if HTTP lookup P95 stays above the product target under mixed teacher/student/remote traffic.
