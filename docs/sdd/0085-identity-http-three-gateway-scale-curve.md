# SDD 0085: Identity HTTP Three-Gateway Scale Curve

## Problem

SDD 0084 proved that the tuned database profile was not the full concurrency
ceiling: a single identity gateway failed at 360 concurrency, while two local
identity gateways passed at 640 and failed at 704.

That narrows the bottleneck to gateway ingress and local accept/connect
pressure, but it does not yet prove whether adding gateway processes continues
to move the ceiling. The next evidence slice should test a three-gateway local
profile against the previous two-gateway failure point and a higher probe.

## Source Requirement References

- Root requirement: the assistant must remain efficient and stable as teaching,
  research, student app, and remote command flows expand.
- SDD 0000: efficient packaging/runtime work belongs in bounded Go hot services
  and Rust local runtime, with tests, evidence, and rollback.
- SDD 0012: Identity HTTP benchmarks are the client-facing performance evidence
  for login, principal lookup, refresh rotation, and revoke cycles.
- SDD 0084: the current two-gateway profile passes at 640 concurrency and fails
  at 704, pointing to gateway ingress capacity.

## Scope

In scope:

- Run live Docker-backed Identity HTTP benchmarks with `--gateway-count 3`.
- Keep the tuned SDD 0083 PostgreSQL/PgBouncer profile unchanged.
- Register the three-gateway evidence in the performance evidence registry.
- Preserve the existing single-gateway and two-gateway evidence for comparison.
- Keep Docker out of `npm test`.

Out of scope:

- Changing root requirements or legacy application source.
- Adding model, OCR, RAG, embedding, vector database, or training dependencies.
- Adding an external reverse proxy or container orchestrator.
- Tuning Windows socket/backlog settings before the 3-gateway scale curve is
  measured.
- Claiming production ultra-high concurrency from local-only evidence.

## Contracts

- Benchmark runner: `tools/run-identity-http-benchmark.mjs`
- Benchmark command: `services/identity-access-gateway/cmd/httpbench`
- Evidence registry:
  `contracts/ops/performance-evidence-registry.current.json`
- Registry audit:
  `tools/performance-evidence-registry-audit.mjs`
- Live reports:
  - `reports/identity-http-benchmark.concurrency768-multi3.json`
  - `reports/identity-http-benchmark.concurrency832-multi3.json`

## Acceptance Criteria

- `node --test tools/performance-evidence-registry-audit.test.mjs` fails before
  three-gateway reports are generated and registered.
- The 768-concurrency three-gateway report is generated and registered.
- The 832-concurrency three-gateway report is generated and registered.
- Registry entries record `gateway.count=3` and application `workerCount=3`.
- Registry statuses match the source report statuses, pass or fail.
- The evidence interpretation states whether a third gateway moves the pass
  point beyond the two-gateway 704 failure point and where the next failed
  probe lands.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0085, the three-gateway report files, the three-gateway registry
entries, and the audit-required report references. Keep SDD 0084 and its
two-gateway evidence as the current ingress-capacity boundary.

## Observability And Performance Evidence

Record:

- red registry audit output before implementation.
- live 3-gateway 768-concurrency benchmark result.
- live 3-gateway 832-concurrency benchmark result.
- performance evidence registry audit result.
- `npm test` and `npm run quality` results.
- Docker shutdown and Rust target cleanup.
