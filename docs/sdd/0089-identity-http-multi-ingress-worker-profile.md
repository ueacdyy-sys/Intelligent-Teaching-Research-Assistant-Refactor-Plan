# SDD 0089: Identity HTTP Multi Ingress Worker Profile

## Problem

SDD 0088 added a local ingress proxy and the first live 1200-concurrency run
failed at the ingress listener. The gateway processes stayed alive and the
failure was still a client-side `connect refused` error, now against the
single ingress port `127.0.0.1:18080`.

That result is useful because it shows that warming only ingress-to-gateway
connections is not enough. The client-facing entry tier also needs worker
fan-out so a cold connection storm is not concentrated on one local listener.

## Source Requirement References

- Root requirement: the assistant must stay stable and efficient under growing
  teaching, research, student app, and remote command traffic.
- SDD 0000: performance-sensitive runtime behavior must be bounded,
  measurable, and reversible.
- SDD 0086: four direct gateway workers passed 1184 and failed 1200 under cold
  direct client connections.
- SDD 0087: four direct gateway workers passed 1200 when benchmark client
  transport connections were warmed and capped.
- SDD 0088: one local ingress proxy with warmed upstream connections failed at
  1200 because the ingress listener itself became the cold client connection
  bottleneck.

## Scope

In scope:

- Extend the benchmark runner with an opt-in `ingressCount` setting.
- Start multiple local ingress proxy workers on consecutive ports.
- Let the benchmark client round-robin across those ingress workers while each
  ingress worker round-robins across the same gateway worker set.
- Record ingress worker count, ingress base URLs, and aggregate warm upstream
  connection totals in success and failure evidence.
- Run live Docker-backed profiles that establish the current multi-ingress
  pass/fail boundary.
- Keep Docker out of `npm test`.

Out of scope:

- Adding an external L4 load balancer, Nginx, Traefik, or Kubernetes.
- Changing root requirements or legacy source.
- Replacing the direct, warmed-client, or single-ingress evidence. They remain
  separate evidence shapes.
- Installing model, OCR, RAG, embedding, vector database, or training
  dependencies.

## Contracts

- Existing local proxy command:
  `services/identity-access-gateway/cmd/ingressproxy`
- Benchmark runner:
  `tools/run-identity-http-benchmark.mjs`
- Focused test:
  `node --test tools/run-identity-http-benchmark.test.mjs`
- Live evidence reports:
  - `reports/identity-http-benchmark.concurrency2600-multi4-ingress13-warm200.json`
  - `reports/identity-http-benchmark.concurrency2800-multi4-ingress14-warm200.json`
- Evidence registry:
  `contracts/ops/performance-evidence-registry.current.json`

## Acceptance Criteria

- Node focused tests fail before the runner can report multiple ingress
  workers and aggregate warm upstream totals.
- Default benchmark behavior is unchanged when ingress is disabled.
- Single-ingress behavior remains available for regression evidence.
- When `ingressCount` is greater than one, the runner starts ingress proxy
  processes on consecutive ports and stops all of them after the benchmark.
- Ingress workers are started and warmed one at a time so startup warmup does
  not create a synthetic upstream connection storm.
- The benchmark client receives a comma-separated list of ingress URLs.
- Successful and failure reports include:
  - `ingressProfile.enabled`
  - `ingressProfile.workerCount`
  - `ingressProfile.baseUrl`
  - `ingressProfile.baseUrls`
  - `ingressProfile.upstreamBaseUrls`
  - `ingressProfile.upstreamTransportProfile`
- `ingressProfile.upstreamTransportProfile.warmConnectionsTotal` represents
  all ingress workers combined.
- A current pass report and nearest failed upper-bound report are generated and
  registered.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0089, the `ingressCount` runner option, multi-ingress report fields,
the four-ingress live report, and the performance registry entry that cites it.
Keep SDD 0088 as the single-ingress failure evidence.

## Observability And Performance Evidence

Record:

- Red focused Node test before runner implementation.
- Focused Node test after implementation.
- Live multi-ingress pass and failed upper-bound benchmark results.
- Performance evidence registry audit result.
- `npm test` and `npm run quality` results.
- Docker shutdown and Rust target cleanup.
