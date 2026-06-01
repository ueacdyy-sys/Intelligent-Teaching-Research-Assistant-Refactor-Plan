# P47 Conversation Dockerized Benchmark Runtime

## Summary

Added SDD 0128 and extended the Research conversation write benchmark runner
with an optional Docker load-generation runtime:

- default remains local `go run`, so `npm test` and `npm run quality` stay
  Docker-free by default
- `--benchmark-runtime docker` runs the Go `httpbench` command inside
  `golang:1.26-alpine`
- loopback benchmark targets are mapped to `host.docker.internal`
- success and failure reports include `benchmarkRuntimeProfile`
- `npm run bench:conversation-write:pgbouncer:docker` is available for future
  upper-bound probes
- Docker runtime helpers were extracted to
  `tools/conversation-benchmark-runtime.mjs` so the main runner remains below
  the 800-line quality gate

This does not change the public Research conversation API, gateway runtime,
PostgreSQL schema, PgBouncer configuration, batching behavior, or baseline
dependency profile.

## Red Test

`node --test tools/run-conversation-write-benchmark.test.mjs` failed before
implementation:

```text
'go' !== 'docker'
```

That proved the conversation runner could not yet run the load generator from
Docker.

## Dockerized Runtime Smoke

Command:

```powershell
npm run bench:conversation-write:pgbouncer:docker -- --gateway-count 1 --db-max-conns 1 --write-batch-size 4 --write-batch-delay-ms 0 --agent-api-key ueacd --concurrency 8 --operations 16 --max-conns-per-host 0 --warm-connections-per-host 0 --pgbouncer-diagnostics true --postgres-diagnostics true --postgres-diagnostics-interval-ms 1000 --postgres-diagnostics-max-samples 5 --out reports/conversation-write-http-benchmark.docker-runtime-smoke.json --timeout 240s --startup-timeout-ms 120000
```

Result:

| Metric | Value |
| --- | ---: |
| status | PASSED |
| executor | DOCKER_GO |
| target base URL | `http://host.docker.internal:18080` |
| concurrency | 8 |
| operations | 16 |
| createConversation errors | 0 |
| runtime diagnostics | present |
| PgBouncer diagnostics | present |
| PostgreSQL diagnostics | present |

This is a runtime smoke only. It is not a promoted performance ceiling and is
not registered as a current capacity claim.

## Verification

Commands run:

```powershell
node --test tools/run-conversation-write-benchmark.test.mjs
node --test tools/run-conversation-write-benchmark.test.mjs tools/performance-evidence-registry-audit.test.mjs
go test ./services/conversation-write-gateway/... -count=1
npm run verify:structure
npm run audit:performance-evidence
npm run quality
```

Results:

- focused conversation runner tests: PASS, 7 tests
- focused runner plus performance registry tests: PASS, 16 tests
- conversation gateway Go tests: PASS
- structure verifier: PASS
- performance evidence registry: READY, 55 entries
- full quality gate: PASS, 19 command steps, 124 Node tests plus Go/Rust tests
- `tools/run-conversation-write-benchmark.mjs`: 797 lines, below the 800-line
  gate

Cleanup:

- `research_conversations` was truncated after the Docker smoke.
- `npm run perf:identity-session:down` stopped the Docker performance profile.
- `docker ps` was empty after cleanup.

## Interpretation

The next honest high-concurrency upper-bound test can now compare:

- Windows-local load generator, which previously showed socket and listener
  pressure around 5800-6200 concurrency; and
- Dockerized load generator, which removes one Windows-local client runtime
  variable while keeping host-started gateway workers and the same PgBouncer
  profile.

Do not promote a new Research conversation ceiling until a Dockerized
high-concurrency report includes `benchmarkRuntimeProfile.executor = DOCKER_GO`,
zero createConversation errors, gateway runtime diagnostics for every worker,
and low tail latency under the chosen SDD target.
