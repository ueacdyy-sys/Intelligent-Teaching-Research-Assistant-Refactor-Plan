# P32 Conversation Write Ingress Profile Evidence

## Scope

This slice adds a Research conversation ingress profile after SDD 0114 showed
the direct six-gateway runner failing at 2200 concurrency with connection
refusals while all gateway processes remained alive.

The implementation keeps Research write semantics conservative: ingress
proxies fan out `POST /v1/research/conversations`, but they do not retry failed
POST writes against another gateway.

## Red To Green Evidence

Focused runner test failed before implementation:

```text
TypeError: ingressBaseUrls is not a function
```

Green focused tests after implementation:

```text
node --test tools/run-conversation-write-benchmark.test.mjs
pass 4
fail 0
```

Go gateway tests:

```text
go test ./services/conversation-write-gateway/cmd/ingressproxy ./services/conversation-write-gateway/... -count=1
PASS
```

## Runtime Profile

- Runner: `npm run bench:conversation-write:pgbouncer`
- PostgreSQL container: `ita-identity-session-postgres`
- PgBouncer container: `ita-identity-session-pgbouncer`
- Gateway count: 6
- Gateway DB pool: `DB_MAX_CONNS=8`
- Total gateway DB pool budget: 48
- Local secrets: `ueacd`

## Ingress Scale Curve

Direct gateway baseline:

- 2100 direct gateway concurrency: PASSED, 5351.62 RPS, P95 404.20ms, 0 errors.
- 2200 direct gateway concurrency: FAILED, 127 connection errors, P95 481.24ms.

Ingress profile:

- 2200 concurrency / 6 ingress / upstream 367: FAILED, 514 connection errors,
  P95 681.99ms.
- 2200 concurrency / 12 ingress / upstream 50: PASSED, 3602.31 RPS,
  P95 773.19ms, 0 errors.
- 2200 concurrency / 12 ingress / upstream 120: PASSED, 4986.07 RPS,
  P95 632.13ms, 0 errors.
- 2400 concurrency / 12 ingress / upstream 120: PASSED, 4911.10 RPS,
  P95 719.99ms, 0 errors.
- 2800 concurrency / 14 ingress / upstream 120: PASSED, 5000.22 RPS,
  P95 857.52ms, 0 errors.
- 3600 concurrency / 18 ingress / upstream 120: FAILED, 144 upstream errors,
  P95 1144.32ms.

## Current Assessment

The ingress profile improves the zero-error concurrency ceiling from the direct
runner-managed 2100 pass point to a 2800 pass point. It does not replace the
current low-latency claim because P95 is above the SDD 0001 500ms target once
the traffic goes through local ingress proxies.

The best current interpretation is:

- Direct gateway profile: best latency target evidence, 2100 concurrency,
  P95 404.20ms.
- Ingress profile: best zero-error capacity evidence, 2800 concurrency,
  roughly 5000 RPS, but P95 857.52ms.
- 3600 ingress failure shows the next bottleneck is upstream proxy saturation or
  gateway-side write tail pressure under proxy fan-out, not PostgreSQL capacity.

## Evidence Files

- `services/conversation-write-gateway/cmd/ingressproxy/main.go`
- `services/conversation-write-gateway/cmd/ingressproxy/main_test.go`
- `tools/run-conversation-write-benchmark.mjs`
- `tools/run-conversation-write-benchmark.test.mjs`
- `reports/conversation-write-http-benchmark.ingress12-concurrency2200-multi6-upstream120.json`
- `reports/conversation-write-http-benchmark.ingress14-concurrency2800-multi6-upstream120.json`
- `reports/conversation-write-http-benchmark.ingress18-concurrency3600-multi6-upstream120.json`

## Final Gates

- `node --test tools/run-conversation-write-benchmark.test.mjs`: PASS, 4 tests.
- `go test ./services/conversation-write-gateway/cmd/ingressproxy ./services/conversation-write-gateway/... -count=1`: PASS.
- `npm run audit:performance-evidence`: PASS, 43 evidence entries.
- `npm run quality`: PASS, strict pre-merge gate.
