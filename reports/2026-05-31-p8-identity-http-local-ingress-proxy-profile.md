# P8 Identity HTTP Local Ingress Proxy Profile

## Summary

Added SDD 0088 and a small local Go ingress proxy for Identity HTTP
performance evidence. The proxy round-robins to local gateway workers and owns
an explicit upstream transport profile, including max upstream connections and
warm keep-alive connections per upstream host.

The first single-ingress live run is intentionally kept as failure evidence:
warming ingress-to-gateway connections does not solve a client cold-connection
storm if all clients target one local ingress listener.

## Live Evidence

| Report | Ingress workers | Gateway workers | Concurrency | Client transport | Upstream transport | Status | Login errors |
| --- | ---: | ---: | ---: | --- | --- | --- | ---: |
| `identity-http-benchmark.concurrency1200-multi4-ingress.json` | 1 | 4 | 1200 | cold, uncapped | warm 300 per gateway | FAILED | 2010 |
| `identity-http-benchmark.concurrency1200-multi4-ingress4-warm300.json` | 4 | 4 | 1200 | warm 300 per ingress | warm 75 per gateway per ingress | PASSED | 0 |

## Interpretation

The single-ingress profile failed during `passwordLogin` with connection
refusals to `127.0.0.1:18080`. The gateway processes did not exit, and the
ingress-to-gateway upstream connections had already been warmed. That moves the
first bottleneck to the client-facing ingress listener.

The four-ingress warmed profile passed at 1200 concurrency with zero phase
errors. That confirms the practical fix is not just "add a proxy"; it is a
multi-worker entry tier plus connection reuse on both client-facing and
upstream-facing transports.

## Verification

Red focused tests:

- `go test ./services/identity-access-gateway/cmd/ingressproxy -count=1 -v`:
  failed before the ingress proxy functions existed.
- `node --test tools/run-identity-http-benchmark.test.mjs`: failed before
  failure reports included `ingressProfile`.

Focused checks after implementation:

- `go test ./services/identity-access-gateway/cmd/ingressproxy -count=1 -v`:
  passed.
- `node --test tools/run-identity-http-benchmark.test.mjs`: passed.

Live checks:

- `npm run perf:identity-session:up`: started Docker identity session runtime.
- `npm run test:identity-session:pgbouncer`: passed.
- Single ingress 1200 run: failed and recorded as the listener bottleneck.
- Four ingress 1200 warmed run: passed.
