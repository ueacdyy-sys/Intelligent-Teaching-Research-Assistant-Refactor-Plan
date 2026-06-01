# P51 Identity Batched Token Issuance

## Summary

This slice used SDD 0151 to reduce cryptographic random reads in the Identity
login and refresh hot paths:

- password/wechat session creation now requests session id, access token, and
  refresh token in one token batch;
- refresh rotation now requests the new access and refresh tokens in one token
  batch;
- existing single-token issuer methods remain as fallback for tests and custom
  issuers.

Result: keep the code change, but do not promote the new report as the current
Identity source evidence yet. The 4400-concurrency follow-up still passed with
zero errors and improved `revokeCycle` P99, but it worsened the standalone
`passwordLogin` and `principalLookup` tails under the same high-fanout profile.

## Evidence

Baseline current source:

`identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-preconnect-retry-ingress19080-clean-table-docker-bench.json`

Batched-token follow-up:

`identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-batched-token-ingress19080-clean-table-docker-bench.json`

Both runs used:

- Docker Go load generator
- PgBouncer `max_db_connections=120`
- 6 gateway workers
- 22 ingress workers
- 12 session DB connections per gateway worker
- 200 client connections per ingress target
- `identity_sessions` as `UNLOGGED`
- 4400 logical concurrency
- 8800 operations per phase
- local secret `ueacd`

| Phase | Baseline P99 ms | Batched P99 ms | Delta ms | Baseline RPS | Batched RPS | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| passwordLogin | 1733.55 | 2304.21 | +570.66 | 3772.29 | 3421.09 | Worse |
| principalLookup | 1248.80 | 1371.57 | +122.77 | 4190.89 | 3829.86 | Worse |
| refreshRotation | 1457.27 | 1209.29 | -247.98 | 4067.14 | 4255.09 | Better |
| revokeCycle | 3071.17 | 2879.83 | -191.34 | 1790.59 | 1724.55 | Better P99, worse RPS |

Revoke-cycle step attribution:

| Step | Baseline P99 ms | Batched P99 ms | Delta ms | Decision |
| --- | ---: | ---: | ---: | --- |
| login | 1498.29 | 1063.31 | -434.98 | Better |
| revoke | 1051.10 | 1069.92 | +18.82 | Roughly flat |
| revokedPrincipalLookup | 953.50 | 1135.22 | +181.72 | Worse |

The slowest revoke-cycle step moved from `login` to
`revokedPrincipalLookup`. That is useful bottleneck movement, but the root
interactive P99 target is still missed.

## Interpretation

The code-level optimization is structurally valid because it removes avoidable
CSPRNG calls while keeping cryptographic randomness and token shape unchanged.
The live result shows the login sub-step inside revoke-cycle improved
substantially, so the intended hot-path reduction exists.

However, the standalone login phase got worse and the whole run took longer
(`187979.91ms` baseline vs `192232.55ms` batched). That means the current
high-concurrency limit is not only token generation. Queueing, transport
scheduling, and DB acquire pressure still dominate enough to move the tails
between phases.

Decision:

- Keep SDD 0151 and the batched-token implementation.
- Keep the existing `pgbouncer120-preconnect-retry` report as the current
  Identity source evidence until another run improves the full phase profile.
- Treat the batched-token 4400 run as mixed evidence, not promotion evidence.
- Next performance slice should add per-operation service-side timing for
  `saveSession`, `getPrincipalByAccessToken`, `rotateRefreshSession`, and
  `revokeOwnSession`, including DB acquire/SQL attribution where possible.

System-design score for this slice: 8/10.

The missing 10/10 evidence is server-side timing that can explain why lowering
token random reads improves revoke login P99 but worsens standalone login P99 in
the same benchmark shape.

## Verification

Commands run:

```powershell
go test ./services/identity-access-gateway/internal/usecase ./services/identity-access-gateway/internal/platform
go test ./services/identity-access-gateway/...
npm run verify:structure
git diff --check
npm run quality
npm run perf:identity-session:up
node tools/run-identity-http-benchmark.mjs --out reports/identity-http-benchmark.batched-token-smoke.json --concurrency 128 --operations 256 --session-db-max-conns 12 --session-db-session-table-persistence unlogged --gateway-count 2 --max-conns-per-host 128 --warm-connections-per-host 128 --pgbouncer-diagnostics true --timeout 120s
npm run perf:identity-session:down
npm run perf:identity-session:up
go run ./services/identity-access-gateway/cmd/sessionmaint -database-url "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" -out reports/identity-session-maintenance.pre-4400-batched-token-ingress19080.json -limit 1000000 -inactive-before 0s -vacuum full -timeout 300s
npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --session-db-write-concurrency 0 --session-db-session-table-persistence unlogged --ingress-proxy true --ingress-port 19080 --ingress-count 22 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 200 --warm-connections-per-host 200 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 2400 --concurrency 4400 --operations 8800 --out reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-batched-token-ingress19080-clean-table-docker-bench.json --timeout 2200s --startup-timeout-ms 180000
go run ./services/identity-access-gateway/cmd/sessionmaint -database-url "postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable" -out reports/identity-session-maintenance.post-4400-batched-token-ingress19080.json -limit 1000000 -inactive-before 0s -vacuum none -timeout 300s
npm run perf:identity-session:down
```

Quality:

- `npm run quality`: PASS.
- Node tests: 229 passed.
- Go and Rust tests passed.
- Identity focused tests passed.

Cleanup:

- The post-run maintenance report shows `identity_sessions.totalRows=0`.
- Docker performance profile was stopped.
