# SDD 0087: Identity HTTP Warmed Transport Profile

## Problem

SDD 0086 narrowed the four-gateway local direct-connection boundary to
1184-concurrency pass and 1200-concurrency fail. The failure still occurred in
`passwordLogin` with connection refusals while the gateway processes had not
exited.

That proves the current direct benchmark can overload gateway ingress, but it
does not separate application/database work from TCP connection establishment
pressure. The refactor needs an explicit benchmark transport profile so
high-concurrency evidence can distinguish cold connection storms from steady
keep-alive traffic, the way a production ingress or reverse proxy would
normally reuse upstream connections.

## Source Requirement References

- Root requirement: the assistant must remain efficient and stable as teaching,
  research, student app, and remote command flows expand.
- SDD 0000: performance-sensitive runtime behavior must be bounded,
  measurable, and reversible.
- SDD 0012: Identity HTTP benchmarks are the client-facing performance evidence
  for login, principal lookup, refresh rotation, and revoke cycles.
- SDD 0086: four local gateways pass at 1184 concurrency and fail at 1200 with
  connection refusals under the cold direct-connection profile.

## Scope

In scope:

- Add explicit HTTP benchmark transport settings for:
  - `maxConnsPerHost`
  - `warmConnectionsPerHost`
- Record the transport profile in successful Go benchmark reports and
  Node-written failure reports.
- Prewarm keep-alive connections per gateway before measured phases when a
  warm connection profile is requested.
- Run a live Docker-backed 1200-concurrency four-gateway warmed-transport
  benchmark to test whether the prior direct-connection failure was mainly
  ingress connection churn.
- Keep Docker out of `npm test`.

Out of scope:

- Changing root requirements or legacy application source.
- Adding model, OCR, RAG, embedding, vector database, or training dependencies.
- Adding Nginx, Traefik, Kubernetes, or any external reverse proxy dependency.
- Replacing the direct-connection 1184/1200 boundary evidence. The warmed
  transport profile is an additional diagnostic and deployment-shape signal.

## Contracts

- Benchmark command: `services/identity-access-gateway/cmd/httpbench`
- Benchmark runner: `tools/run-identity-http-benchmark.mjs`
- Focused tests:
  - `go test ./services/identity-access-gateway/cmd/httpbench`
  - `node --test tools/run-identity-http-benchmark.test.mjs`
- Warmed transport report:
  `reports/identity-http-benchmark.concurrency1200-multi4-warm300.json`
- Evidence registry:
  `contracts/ops/performance-evidence-registry.current.json`

## Acceptance Criteria

- Go focused tests fail before `httpbench` exposes and reports a transport
  profile.
- Node focused tests fail before the runner forwards warmed transport options
  and records them in failure reports.
- Default benchmark behavior is unchanged: no max-connection cap and no warm
  connection prefill unless explicitly requested.
- Successful reports include `transportProfile.maxConnsPerHost`,
  `transportProfile.warmConnectionsPerHost`, and
  `transportProfile.warmConnectionsTotal`.
- Failure reports include the same transport profile fields.
- The live 1200-concurrency four-gateway warmed profile is generated and
  registered as additional evidence.
- The registry keeps the direct 1184 pass / 1200 fail pair and clearly labels
  the warmed profile as a different transport shape.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0087, the warmed transport flags and report fields, the warmed live
report, and the performance registry entry that cites it. Keep SDD 0086 as the
current direct-connection boundary.

## Observability And Performance Evidence

Record:

- red focused Go and Node tests before implementation.
- focused Go and Node tests after implementation.
- live warmed 1200-concurrency benchmark result.
- performance evidence registry audit result.
- `npm test` and `npm run quality` results.
- Docker shutdown and Rust target cleanup.
