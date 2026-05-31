# SDD 0088: Identity HTTP Local Ingress Proxy Profile

## Problem

SDD 0087 proved that the four-gateway Identity HTTP workload can pass at
1200 concurrency when upstream connections are warmed and capped per gateway.
The direct cold-connection profile at the same concurrency failed during
`passwordLogin` with connection refusals while the gateway processes stayed
alive.

That means the next performance question is not whether PostgreSQL or
PgBouncer can finish the mixed read/write workload at 1200 concurrency. The
next question is whether a production-shaped entry point can absorb client
connection churn and reuse warm upstream connections to the Go gateway workers.

## Source Requirement References

- Root requirement: the assistant must stay stable and efficient as teaching,
  research, student app, and remote command traffic grow.
- SDD 0000: performance-sensitive runtime behavior must be bounded,
  measurable, and reversible.
- SDD 0012: Identity HTTP benchmarks are the client-facing performance evidence
  for login, principal lookup, refresh rotation, and revoke cycles.
- SDD 0086: four local gateways pass at 1184 concurrency and fail at 1200 under
  the direct cold-connection profile.
- SDD 0087: four local gateways pass at 1200 concurrency when benchmark
  transport connections are warmed and capped.

## Scope

In scope:

- Add a small local Go ingress proxy for performance evidence.
- Round-robin requests from one public entry URL to multiple local Identity
  gateway upstreams.
- Configure the proxy upstream transport independently from the benchmark
  client transport.
- Optionally warm upstream keep-alive connections before exposing the benchmark
  entry point.
- Extend the Node benchmark runner with an opt-in ingress proxy profile.
- Record ingress proxy settings in both successful and failure benchmark
  reports.
- Run live Docker-backed evidence for a four-gateway, one-ingress, 1200
  concurrency profile.
- Keep Docker out of `npm test`.

Out of scope:

- Changing root requirements or legacy application source.
- Replacing the direct four-gateway boundary evidence.
- Adding Nginx, Traefik, Kubernetes, or another external reverse-proxy
  dependency in this slice.
- Installing model, OCR, RAG, embedding, vector database, or training
  dependencies.

## Contracts

- New local proxy command:
  `services/identity-access-gateway/cmd/ingressproxy`
- Benchmark runner:
  `tools/run-identity-http-benchmark.mjs`
- Focused tests:
  - `go test ./services/identity-access-gateway/cmd/ingressproxy`
  - `node --test tools/run-identity-http-benchmark.test.mjs`
- Live evidence report:
  `reports/identity-http-benchmark.concurrency1200-multi4-ingress.json`
- Evidence registry:
  `contracts/ops/performance-evidence-registry.current.json`

## Acceptance Criteria

- Go focused tests fail before the proxy can parse upstreams, select them
  round-robin, and report its upstream transport profile.
- Node focused tests fail before the runner records ingress profile metadata in
  failure reports.
- Default benchmark behavior is unchanged when ingress is not requested.
- When ingress is enabled, the benchmark client sees one public base URL while
  the runner still starts the configured gateway worker count.
- Successful reports include:
  - `ingressProfile.enabled`
  - `ingressProfile.baseUrl`
  - `ingressProfile.upstreamBaseUrls`
  - `ingressProfile.upstreamTransportProfile`
- Failure reports include the same ingress profile fields.
- The live four-gateway ingress profile is generated and registered as
  additional evidence.
- The registry keeps the direct 1184 pass / 1200 fail pair and the warmed
  benchmark-client profile as separate evidence shapes.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0088, the ingress proxy command, runner ingress flags, ingress report
fields, live ingress report, and performance registry entry. Keep SDD 0086 and
SDD 0087 as the current direct and warmed-transport evidence.

## Observability And Performance Evidence

Record:

- Red focused Go and Node tests before implementation.
- Focused Go and Node tests after implementation.
- Live four-gateway ingress benchmark result.
- Performance evidence registry audit result.
- `npm test` and `npm run quality` results.
- Docker shutdown and Rust target cleanup.
