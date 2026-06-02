# P63 Identity Revoked Token Deny Cache

## Summary

This slice added a process-local short TTL deny cache for access tokens revoked
by the same Identity gateway process. The goal was to remove the immediate
post-revoke principal DB read in the synthetic `revokeCycle` path without
changing public Identity contracts or adding Redis/distributed cache
dependencies.

The use-case tests passed and proved the local behavior. The first full mixed
`mixed5800` rerun was not usable as a passing capacity result because Identity
ingress returned one `502 upstream unavailable` during `passwordLogin`. A
follow-up Identity-only 4400 case passed, but showed the local deny cache was
mostly defeated by ingress round-robin across gateway workers.

## Implementation

- `IdentityService` now records a revoked access token after successful
  self-session revoke.
- `GetPrincipal` checks the deny cache before hitting `SessionStore`.
- The deny cache is in-process only, bounded, and short lived.
- The durable session database remains the source of truth.

## Verification

Focused checks:

```powershell
go test ./services/identity-access-gateway/internal/usecase -run "Revoked|RevokeSessionDenyCaches|DifferentSession|RevokeSessionUsesOptimized" -count=1
go test ./services/identity-access-gateway/... -count=1
npm run verify:structure
npm run quality
```

All passed before running the P63 benchmarks.

## Mixed 5800 Probe

Command shape matched P62 except for the new code under test:

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p63-revoked-token-deny-cache-mixed-5800.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p63-revoked-token-deny-cache-mixed-5800 --profile SUSTAINED_SCALEUP_P63_REVOKED_TOKEN_DENY_CACHE_MIXED_5800 --manage-docker true --docker-cleanup reset --stop-on-failure true --steps mixed5800:5800:11600:5800:11600:290:580 --samples 1 --sample-interval-ms 0 --identity-gateway-count 12 --conversation-gateway-count 16 --identity-session-db-max-conns 10 --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 64 --max-conns-per-host 300 --warm-connections-per-host 75 --identity-max-conns-per-host 150 --identity-warm-connections-per-host 150 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 16 --identity-ingress-max-conns-per-host 40 --identity-ingress-warm-connections-per-host 16 --timeout 2400s --startup-timeout-ms 180000 --max-p99-ms 3000 --max-p99-drift-ms 1000
```

Result: failed as capacity evidence.

- Rollup: `reports/system-sustained-mixed-workload-scaleup.p63-revoked-token-deny-cache-mixed-5800.json`
- Identity child: `reports/system-sustained-mixed-workload-scaleup.p63-revoked-token-deny-cache-mixed-5800.1-mixed5800.1.identity-http.json`
- Failure: one Identity ingress `502 upstream unavailable` during
  `passwordLogin`.
- Total rollup errors: `0`
- Max observed P99 in the failed rollup: `2396ms`

This is not a full-system pass. It is a failed ingress stability probe with
useful latency readings.

## Identity 4400 Probe

Command:

```powershell
npm run bench:identity-phase-matrix -- --out reports/identity-phase-matrix.p63-revoked-token-deny-cache-4400.json --case-prefix reports/identity-phase-matrix.p63-revoked-token-deny-cache-4400 --profile IDENTITY_PHASE_MATRIX_P63_REVOKED_TOKEN_DENY_CACHE_4400 --concurrency 4400 --operations 8800 --cases "g12-p10-i16-c150:12:10:16:150:150:40:16" --timeout 2200s --startup-timeout-ms 180000 --docker-cleanup reset --stop-on-failure true
```

Result: passed.

| Metric | P55 baseline | P63 deny cache |
| --- | ---: | ---: |
| Revoke-cycle P99 | 2377.39ms | 2556.38ms |
| Revoke-cycle DB acquire count | 26400 | 25681 |
| Revoke-cycle DB acquire duration | 9236214.3ms | 9628232.89ms |
| Revoke-cycle access lookups | 8800 | 8081 |

## Interpretation

The deny cache worked, but only when the post-revoke lookup hit the same gateway
process that handled the revoke. Current Identity ingress round-robin routes
requests independently, so only `719/8800` revoked-token lookups avoided the
database in the P63 Identity-only run.

This slice therefore identified the next real bottleneck: process-local revoke
state needs ingress affinity for bearer-token requests. Without affinity, local
caching is correct but underused.

Do not promote full-system ultra-concurrency support from P63.
