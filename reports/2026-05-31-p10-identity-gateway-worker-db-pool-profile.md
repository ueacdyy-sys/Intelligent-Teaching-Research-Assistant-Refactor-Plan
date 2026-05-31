# P10 Identity Gateway Worker DB Pool Profile

## Summary

Added SDD 0091 and made Identity HTTP benchmark reports record the gateway-side
database profile:

- gateway worker count
- `SESSION_DB_MAX_CONNS` per worker
- total configured gateway database client connections

This turns worker-count tuning into auditable evidence. The previous profile
used four gateway workers with `SESSION_DB_MAX_CONNS=16`, for a gateway-side
client budget of 64. This slice tested six gateway workers with
`SESSION_DB_MAX_CONNS=12`, for a gateway-side client budget of 72, staying below
the current PgBouncer `max_db_connections=90` setting.

## Reason

The earlier 2800-concurrency probe failed during `passwordLogin` with ingress
`502 upstream unavailable` responses even after multi-ingress warmup. After the
refresh fast path, the next risk was no longer a single SQL round trip in
refresh rotation alone; the evidence pointed to gateway/upstream pressure and
remaining mixed write/read tail latency.

Raising gateway workers without lowering the per-worker database pool would
silently raise database client pressure. The safer profile increases gateway
request-serving capacity while keeping total gateway database clients bounded.

## Red Test

`node --test tools/run-identity-http-benchmark.test.mjs` failed before
implementation because `gatewayDatabaseProfile` was missing from generated
failure and success evidence.

## Verification

Focused check:

- `node --test tools/run-identity-http-benchmark.test.mjs`: passed after adding
  gateway database profile reporting.

Live Identity HTTP comparison:

| Report | Client connections | Ingress workers | Gateway workers | DB pool total | Concurrency | Status | Login P95 | Principal P95 | Refresh P95 | Revoke P95 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency2600-multi4-ingress13-warm200.json` | 2600 | 13 | 4 | 64 | 2600 | PASSED | 685.04ms | 635.87ms | 1449.84ms | 1248.05ms | 0 |
| `identity-http-benchmark.concurrency2800-multi4-ingress14-warm200.json` | 2800 | 14 | 4 | 64 | 2800 | FAILED | n/a | n/a | n/a | n/a | 465 |
| `identity-http-benchmark.concurrency2800-multi6-ingress14-pool12-client150-upwarm34.json` | 2100 | 14 | 6 | 72 | 2800 | PASSED | 525.79ms | 720.85ms | 824.18ms | 1206.81ms | 0 |
| `identity-http-benchmark.concurrency3000-multi6-ingress15-pool12-client150-upwarm30.json` | 2250 | 15 | 6 | 72 | 3000 | PASSED | 620.89ms | 757.60ms | 1064.10ms | 1400.51ms | 0 |
| `identity-http-benchmark.concurrency3200-multi6-ingress16-pool12-client150-upwarm28.json` | 2400 | 16 | 6 | 72 | 3200 | FAILED | n/a | n/a | n/a | n/a | 93 |

## Interpretation

The previous local boundary was 2600 pass and 2800 fail under the four-gateway
profile. With six gateway workers and a bounded pool of 12 database clients per
worker, the current local profile passed 3000 logical concurrent clients and
failed at 3200.

The 3200 failure happened during `principalLookup` with ingress 502 responses,
not during local client socket allocation. That makes it a useful current upper
bound for the service path under this Windows-local benchmark profile.

The 3000 pass is not proof of unlimited or "ultra-high" concurrency. It shows
that the current refactored Identity boundary can exceed the previous 2600/2800
wall when gateway worker count and database client pool budget are tuned
together. Revoke remains the dominant slow tail at the new pass point:
`revokeCycle.p95_ms = 1400.51`.

## Notes

Two 2800 probes were discarded and not registered because they failed with
Windows client socket exhaustion before they could measure the service path:

- six gateway workers with 4200 ingress-to-gateway warm connections
- six gateway workers with 2800 client warm connections and a single local
  socket reuse failure during principal lookup

The registered higher-worker evidence uses capped client keep-alive connections
to avoid making the local Windows load generator the first bottleneck.

## Next Step

Keep this profile as the current Identity HTTP boundary evidence:

- highest current local logical-concurrency pass: 3000
- nearest current local logical-concurrency fail: 3200

The next performance slice should target the remaining write/read tail,
especially revoke-cycle P95 and ingress-to-gateway 502s under principal lookup.
