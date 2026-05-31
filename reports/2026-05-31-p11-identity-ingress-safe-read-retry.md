# P11 Identity Ingress Safe Read Retry

## Summary

Added SDD 0092 and changed the Identity ingress proxy to retry only safe read
methods (`GET` and `HEAD`) when an upstream gateway returns a transport error
before producing any response.

Mutation methods remain single-attempt. The ingress still does not retry
`POST`, `PUT`, `PATCH`, or `DELETE`, so password login, refresh rotation, and
revocation do not risk duplicate side effects.

## Reason

The previous local boundary evidence was:

- 3000 logical concurrent clients passed.
- 3200 logical concurrent clients failed during `principalLookup` with 93
  ingress 502 responses.

That failure phase is a read-only `GET /v1/identity/principal`, so a bounded
retry to another gateway worker is a low-risk resilience improvement. The
measured smell was not a business-contract problem; it was an ingress
transport failure being surfaced too eagerly for idempotent reads.

## Red Test

`go test ./services/identity-access-gateway/cmd/ingressproxy -run "TestIngressHandler" -count=1 -v`
failed before implementation:

- `TestIngressHandlerRetriesSafeGetOnUpstreamTransportError`: failed because
  the first upstream transport error returned HTTP 502 instead of retrying the
  second upstream.
- `TestIngressHandlerDoesNotRetryPostOnUpstreamTransportError`: passed,
  proving the expected write-path guard before the implementation changed.

## Implementation

The ingress proxy still uses `httputil.ReverseProxy` for normal proxy behavior.
The change wraps the upstream `RoundTripper` with a safe-read retry transport:

- first attempt keeps the existing round-robin selection
- `GET` and `HEAD` retry another unattempted upstream on transport error
- non-replayable request bodies are not retried
- mutation methods never retry
- forwarded host/protocol and original path/query are preserved across retry
  attempts

## Verification

Focused checks:

- `go test ./services/identity-access-gateway/cmd/ingressproxy -run "TestIngressHandler" -count=1 -v`: passed
- `go test ./services/identity-access-gateway/... -count=1`: passed

Live Identity HTTP regression:

| Report | Client warm connections | Ingress workers | Gateway workers | DB pool total | Concurrency | Status | Login P95 | Principal P95 | Refresh P95 | Revoke P95 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| `identity-http-benchmark.concurrency3000-multi6-ingress15-pool12-client150-upwarm30.json` | 2250 | 15 | 6 | 72 | 3000 | PASSED | 620.89ms | 757.60ms | 1064.10ms | 1400.51ms | 0 |
| `identity-http-benchmark.concurrency3000-multi6-ingress15-pool12-client150-upwarm30-safe-retry.json` | 2250 | 15 | 6 | 72 | 3000 | PASSED | 567.92ms | 673.90ms | 842.43ms | 1289.79ms | 0 |

## Discarded 3200 Probe

A same-shape 3200 safe-retry probe was run after the implementation. It no
longer failed as ingress `502 upstream unavailable`; instead, it failed during
`principalLookup` with 6 client-side socket/buffer errors:

`dial tcp 127.0.0.1:18095: bind: An operation on a socket could not be performed because the system lacked sufficient buffer space or because a queue was full.`

That probe was not registered as service evidence because it hit the local
Windows load generator wall. It is useful as a warning: after this slice, the
next honest 3200+ boundary test needs a cleaner load-generation environment
such as WSL/Linux or a Dockerized benchmark runner, not just more local
Windows sockets.

## Interpretation

The verified local service pass point remains 3000 logical concurrent clients.
At that pass point, the safe-read retry slice improved read-path resilience and
reduced the observed tails across the mixed workload.

This still is not proof of ultra-high concurrency. The current evidence says:

- the six-gateway, bounded database pool profile is stable at 3000 locally
- ingress safe-read retry removes one class of transient 502 on idempotent reads
- 3200+ cannot be honestly claimed from the current Windows-local load
  generator evidence

## Next Step

To push the ceiling further, move the benchmark runner off the Windows socket
bottleneck before adding more app-level tuning. Then retest:

- 3200 with the same 6 gateway / pool 12 / 16 ingress profile
- if 3200 passes, probe 3400
- keep revoke-cycle P95 as the slowest successful tail to optimize next
