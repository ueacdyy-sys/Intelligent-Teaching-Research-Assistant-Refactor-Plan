# P13 Identity Revoke Cycle Step Profile

## Summary

Added SDD 0094 and extended the Identity HTTP benchmark report with optional
`stepLatencyMs` data for the `revokeCycle` phase.

The benchmark workload did not change. `revokeCycle` still performs:

- password login
- session revoke
- post-revoke principal lookup that must return unauthorized

The new report shape exposes those three sub-step latency summaries so future
performance changes can target the measured bottleneck rather than the whole
mixed phase.

## Red Test

`go test ./services/identity-access-gateway/cmd/httpbench -run TestBuildPhaseReportWithStepLatencies -count=1 -v`
failed before implementation because `buildPhaseReportWithStepLatencies` did
not exist.

## Verification

Focused checks:

- `go test ./services/identity-access-gateway/cmd/httpbench -run TestBuildPhaseReportWithStepLatencies -count=1 -v`: passed
- `go test ./services/identity-access-gateway/cmd/httpbench -run Test -count=1 -v`: passed

Dockerized 4000-concurrency profile:

`npm run bench:identity-http:pgbouncer:docker -- --gateway-count 6 --session-db-max-conns 12 --ingress-proxy true --ingress-port 18080 --ingress-count 20 --ingress-max-conns-per-host 50 --ingress-warm-connections-per-host 22 --max-conns-per-host 150 --warm-connections-per-host 150 --concurrency 4000 --operations 8000 --out reports/identity-http-benchmark.concurrency4000-multi6-ingress20-pool12-client150-upwarm22-docker-bench-revoke-profile.json --timeout 1900s --startup-timeout-ms 180000`

Result: passed with zero phase errors.

| Metric | P95 |
| --- | ---: |
| passwordLogin | 1542.07ms |
| principalLookup | 986.57ms |
| refreshRotation | 5151.99ms |
| revokeCycle total | 2446.49ms |
| revokeCycle.login | 1043.05ms |
| revokeCycle.revoke | 761.99ms |
| revokeCycle.revokedPrincipalLookup | 743.18ms |

## Interpretation

This profile shows that the `revokeCycle` tail is not dominated by the revoke
SQL update alone. Its P95 is the sum of three substantial HTTP and database
operations, with the login step contributing the largest sub-step tail in this
run.

The run also exposed a separate variance signal: `refreshRotation.p95_ms`
spiked to `5151.99ms`, much higher than the previous 4000-concurrency baseline.
That makes the next optimization slice a refresh-rotation root-cause profile,
not a blind revoke SQL or connection-limit change.

## Next Step

Add equivalent step observability to `refreshRotation` or run a focused
refresh-only profile before changing database or gateway limits. The current
registered 4000 Dockerized pass point remains valid; this report is diagnostic
evidence for the next bottleneck investigation.
