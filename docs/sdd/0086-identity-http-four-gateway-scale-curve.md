# SDD 0086: Identity HTTP Four-Gateway Scale Curve

## Problem

SDD 0085 proved that increasing the local Identity HTTP gateway count from two
to three moved the measured pass point from 640 to 768 concurrency, with the
next 832-concurrency probe failing during `passwordLogin` with connection
refusals.

That points to gateway ingress and local accept/connect pressure rather than
PostgreSQL/PgBouncer saturation under the current tuned database profile. The
next configuration optimization is to measure whether a fourth local gateway
process continues the scale curve and gives the refactor a stronger current
answer about the system's high-concurrency boundary.

## Source Requirement References

- Root requirement: the assistant must remain efficient and stable as teaching,
  research, student app, and remote command flows expand.
- SDD 0000: bounded Go hot services and Rust local runtime are the preferred
  high-performance runtime boundaries, backed by tests, evidence, and rollback.
- SDD 0012: Identity HTTP benchmarks are the client-facing performance evidence
  for login, principal lookup, refresh rotation, and revoke cycles.
- SDD 0084: multi-gateway benchmarking is the current mechanism for measuring
  local gateway ingress scaling.
- SDD 0085: three gateways passed at 768 concurrency and failed at 832,
  identifying the next scale target.

## Scope

In scope:

- Run live Docker-backed Identity HTTP benchmarks with `--gateway-count 4`.
- Keep the tuned SDD 0083 PostgreSQL/PgBouncer profile unchanged.
- Register the nearest durable four-gateway pass/fail pair in the performance
  evidence registry.
- Preserve the single-gateway, two-gateway, and three-gateway evidence for
  comparison.
- Keep Docker out of `npm test`.

Out of scope:

- Changing root requirements or legacy application source.
- Adding model, OCR, RAG, embedding, vector database, or training dependencies.
- Adding an external reverse proxy or container orchestrator.
- Claiming production ultra-high concurrency from local-only evidence.
- Tuning Windows socket/backlog settings before the four-gateway scale curve is
  measured.

## Contracts

- Benchmark runner: `tools/run-identity-http-benchmark.mjs`
- Benchmark command: `services/identity-access-gateway/cmd/httpbench`
- Evidence registry:
  `contracts/ops/performance-evidence-registry.current.json`
- Registry audit:
  `tools/performance-evidence-registry-audit.mjs`
- Live reports:
  - `reports/identity-http-benchmark.concurrency1184-multi4.json`
  - `reports/identity-http-benchmark.concurrency1200-multi4.json`

## Acceptance Criteria

- `node --test tools/performance-evidence-registry-audit.test.mjs` fails before
  four-gateway reports are generated and registered.
- The 1184-concurrency four-gateway report is generated and registered.
- The 1200-concurrency four-gateway report is generated and registered.
- Registry entries record `gateway.count=4` and application `workerCount=4`.
- Registry statuses match the source report statuses, pass or fail.
- The evidence interpretation states whether a fourth gateway moves the pass
  point beyond the three-gateway 832 failure point and where the next failed
  probe lands.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0086, the four-gateway report files, the four-gateway registry
entries, and the audit-required report references. Keep SDD 0085 and its
three-gateway evidence as the current ingress-capacity boundary.

## Observability And Performance Evidence

Record:

- red registry audit output before implementation.
- live 4-gateway 1184-concurrency benchmark result.
- live 4-gateway 1200-concurrency benchmark result.
- performance evidence registry audit result.
- `npm test` and `npm run quality` results.
- Docker shutdown and Rust target cleanup.
