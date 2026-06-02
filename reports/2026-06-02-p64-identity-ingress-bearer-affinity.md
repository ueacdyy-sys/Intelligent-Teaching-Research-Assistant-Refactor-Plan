# P64 Identity Ingress Bearer Affinity

## Summary

P63 proved the local revoked-token deny cache was mostly defeated by Identity
ingress round-robin. P64 changed ingress upstream selection so requests with the
same `Authorization: Bearer <token>` route to a stable gateway worker, while
tokenless requests keep round-robin behavior.

Result: the same 4400 Identity case passed and removed the post-revoke DB
principal lookup from `revokeCycle`.

## Implementation

- Identity ingress now chooses `hash(accessToken) % upstreamCount` for bearer
  requests.
- Tokenless requests continue to use round-robin.
- Existing safe retry behavior remains: retryable failures may still move to
  another upstream.
- No token values are logged or persisted.

## Verification

Focused checks:

```powershell
go test ./services/identity-access-gateway/cmd/ingressproxy -count=1
go test ./services/identity-access-gateway/internal/usecase -run "Revoked|RevokeSessionDenyCaches|DifferentSession|RevokeSessionUsesOptimized" -count=1
```

Benchmark command:

```powershell
npm run bench:identity-phase-matrix -- --out reports/identity-phase-matrix.p64-ingress-bearer-affinity-4400.json --case-prefix reports/identity-phase-matrix.p64-ingress-bearer-affinity-4400 --profile IDENTITY_PHASE_MATRIX_P64_INGRESS_BEARER_AFFINITY_4400 --concurrency 4400 --operations 8800 --cases "g12-p10-i16-c150:12:10:16:150:150:40:16" --timeout 2200s --startup-timeout-ms 180000 --docker-cleanup reset --stop-on-failure true
```

Result: passed.

- Rollup: `reports/identity-phase-matrix.p64-ingress-bearer-affinity-4400.json`
- Child report:
  `reports/identity-phase-matrix.p64-ingress-bearer-affinity-4400.1-g12-p10-i16-c150.json`
- Errors: `0`
- Recommended case: `g12-p10-i16-c150`

## Evidence

| Metric | P55 baseline | P63 deny cache only | P64 deny cache + affinity |
| --- | ---: | ---: | ---: |
| Revoke-cycle P95 | 2329.74ms | 2461.5ms | 2133.72ms |
| Revoke-cycle P99 | 2377.39ms | 2556.38ms | 2245.49ms |
| Revoke-cycle RPS | n/a | 1878.83 | 2419.3 |
| Revoke-cycle DB acquire count | 26400 | 25681 | 17600 |
| Revoke-cycle DB acquire duration | 9236214.3ms | 9628232.89ms | 5977826.05ms |
| Revoke-cycle access lookups | 8800 | 8081 | 0 |
| Revoked principal lookup P99 | 850.03ms | 857.75ms | 485.2ms |

P64 removes one database operation from each revoke cycle:

```text
P55/P63: login save + revoke own session + revoked principal DB lookup
P64:     login save + revoke own session + local deny-cache lookup
```

## Interpretation

This is a real Identity read/write-path improvement. The bottleneck was not only
database capacity; it was request placement across gateway workers preventing a
correct local optimization from being used.

The result still does not prove whole-system ultra-high concurrency support:

- P64 is Identity-only at 4400 logical concurrency.
- The P63 `mixed5800` probe still failed on one ingress upstream availability
  event.
- Root SLO promotion remains blocked until mixed workload, root workflow, and
  sustained evidence are all clean.

## Next Step

Rerun the P62-shaped `mixed5800` workload with bearer affinity enabled. If the
single ingress 502 does not recur, compare whole-system max P99 and Identity
revoke-cycle diagnostics against P62 before attempting any higher concurrency.
