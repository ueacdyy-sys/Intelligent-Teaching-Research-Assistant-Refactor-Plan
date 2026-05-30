# SDD 0084: Identity HTTP Multi-Gateway Benchmark

## Problem

SDD 0083 aligned the identity-only Docker PostgreSQL/PgBouncer profile with the
current high-concurrency database settings, then reran the client-facing HTTP
benchmark. The 320-concurrency run still passes, while the 360-concurrency
probe still fails during the login write phase with connection refusals.

That result reduces the likelihood that PostgreSQL or PgBouncer capacity is the
primary blocker. The next measured question is whether the limit is caused by a
single local identity gateway ingress path. The benchmark runner must support a
multi-gateway profile before the refactor can fairly evaluate higher
concurrency.

## Source Requirement References

- Root requirement: the assistant must remain efficient and stable as teaching,
  research, student app, and remote command flows expand.
- SDD 0000: packaging and runtime work belongs in Rust local runtime and Go hot
  services, with performance evidence and rollback for new runtime boundaries.
- SDD 0012: Identity HTTP benchmarks are the client-facing performance evidence
  for login, principal lookup, refresh rotation, and revoke cycles.
- SDD 0082: failed limit probes must be captured as machine-readable evidence.
- SDD 0083: the tuned database profile did not move the 360-concurrency failure
  point, so the next slice should test multi-worker or load-balanced gateway
  ingress.

## Scope

In scope:

- Add a multi-gateway mode to `tools/run-identity-http-benchmark.mjs` using
  multiple local Go gateway processes on consecutive ports.
- Add round-robin multi-base-URL support to
  `services/identity-access-gateway/cmd/httpbench`.
- Record gateway count, gateway base URLs, and load-balancing strategy in
  success and failure reports.
- Preserve local secrets as `ueacd` and mask them from failure output.
- Keep Docker out of `npm test`; Docker remains explicit live evidence for the
  database-backed benchmark.

Out of scope:

- Changing root requirements or legacy application source.
- Adding Nginx, Traefik, Kubernetes, model, OCR, RAG, embedding, vector
  database, or training dependencies.
- Claiming ultra-high concurrency until live multi-gateway evidence proves it.
- Replacing the single-gateway benchmark evidence; the multi-gateway run is an
  additional comparison point.

## Contracts

- Runner: `tools/run-identity-http-benchmark.mjs`
- Focused runner test: `tools/run-identity-http-benchmark.test.mjs`
- Benchmark command: `services/identity-access-gateway/cmd/httpbench`
- Focused Go benchmark tests:
  `services/identity-access-gateway/cmd/httpbench/main_test.go`
- Optional live report:
  `reports/identity-http-benchmark.concurrency360-multi2.json`
- Registry:
  `contracts/ops/performance-evidence-registry.current.json`

Report fields added by this SDD:

- `gatewayCount`
- `gatewayBaseUrls`
- `loadBalancingStrategy`

## Acceptance Criteria

- `node --test tools/run-identity-http-benchmark.test.mjs` fails before the
  runner exposes multi-gateway URL planning and failure evidence fields.
- `go test ./services/identity-access-gateway/cmd/httpbench` fails before the
  benchmark supports comma-separated base URLs and round-robin routing.
- `--gateway-count 1` preserves the existing single-gateway behavior.
- `--gateway-count 2 --base-url http://127.0.0.1:18100` starts gateways on
  `18100` and `18101`, then passes both URLs to the benchmark.
- Success and failure reports include gateway count, base URLs, and
  `ROUND_ROBIN` when multiple gateways are used.
- Live Docker-backed multi-gateway evidence is written to a distinct report
  path when the benchmark is run.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0084, the runner multi-gateway options, the HTTP benchmark
multi-base-URL routing, the focused tests, any generated multi-gateway report,
and any performance registry entry that cites it. The SDD 0083 single-gateway
evidence remains the current limit evidence.

## Observability And Performance Evidence

Record:

- red focused runner and Go benchmark test output before implementation.
- focused test output after implementation.
- live multi-gateway Identity HTTP benchmark result when Docker is available.
- performance evidence registry audit result if a live report is registered.
- `npm test` and `npm run quality` results.
- Docker shutdown and Rust target cleanup.
