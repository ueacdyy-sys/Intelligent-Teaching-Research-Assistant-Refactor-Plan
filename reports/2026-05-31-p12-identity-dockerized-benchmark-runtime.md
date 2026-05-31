# P12 Identity Dockerized Benchmark Runtime

## Summary

Added SDD 0093 and extended the Identity HTTP benchmark runner with an optional
Docker benchmark runtime:

- default remains local `go run`, so `npm test` stays Docker-free
- `--benchmark-runtime docker` runs `httpbench` inside `golang:1.26-alpine`
- loopback targets are mapped to `host.docker.internal`
- success and failure reports now include `benchmarkRuntimeProfile`
- `npm run bench:identity-http:pgbouncer:docker` is available for high-load
  probes

This directly addresses the previous 3200 safe-retry probe, which no longer
failed as service-side ingress 502 but instead hit the Windows-local load
generator socket/buffer wall.

## Red Test

`node --test tools/run-identity-http-benchmark.test.mjs` failed before
implementation because generated reports did not include
`benchmarkRuntimeProfile`, and the runner could not build a Docker benchmark
command.

## Verification

Focused checks:

- `node --test tools/run-identity-http-benchmark.test.mjs`: passed
- `node --test tools/*.test.mjs`: passed
- `npm run verify:structure`: passed

Dockerized runtime smoke:

- `npm run bench:identity-http:pgbouncer:docker -- --concurrency 64 --operations 128 --out reports/identity-http-benchmark.docker-runtime-smoke.json --timeout 240s --startup-timeout-ms 180000`: passed

Dockerized high-concurrency probes:

| Report | Runtime | Client warm connections | Ingress workers | Gateway workers | DB pool total | Concurrency | Status | Login P95 | Principal P95 | Refresh P95 | Revoke P95 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency3200-multi6-ingress16-pool12-client150-upwarm28-docker-bench.json` | Docker Go | 2400 | 16 | 6 | 72 | 3200 | PASSED | 1136.44ms | 742.18ms | 873.56ms | 1788.80ms | 0 |
| `identity-http-benchmark.concurrency3400-multi6-ingress17-pool12-client150-upwarm26-docker-bench.json` | Docker Go | 2550 | 17 | 6 | 72 | 3400 | PASSED | 896.42ms | 778.60ms | 1376.47ms | 1760.08ms | 0 |
| `identity-http-benchmark.concurrency3600-multi6-ingress18-pool12-client150-upwarm25-docker-bench.json` | Docker Go | 2700 | 18 | 6 | 72 | 3600 | PASSED | 861.08ms | 831.56ms | 919.95ms | 1936.59ms | 0 |
| `identity-http-benchmark.concurrency4000-multi6-ingress20-pool12-client150-upwarm22-docker-bench.json` | Docker Go | 3000 | 20 | 6 | 72 | 4000 | PASSED | 1109.03ms | 934.66ms | 1100.00ms | 2314.23ms | 0 |

## Interpretation

The current verified local-host service pass point is now 4000 logical
concurrent clients under a Dockerized load generator. This supersedes the
previous Windows-local 3000 pass point for capacity discussion, while keeping
the older 3200 Windows-local failure as useful evidence about the load
generator wall.

This still is not an unlimited-concurrency claim. The 4000 probe passed, so the
nearest failed Dockerized upper probe has not been found yet. Revoke cycle is
again the slowest successful tail at the highest pass point:
`revokeCycle.p95_ms = 2314.23`.

## Next Step

Use the Docker benchmark runtime for future upper-bound probes. The next honest
capacity slice should either:

- probe 4400 and 4800 with the same six-gateway pool budget, or
- optimize revoke-cycle write/read tail before pushing higher.
