# SDD 0098: Identity Clean-Table Client Transport Profile

## Problem

SDD 0097 proved that the clean-table Identity HTTP profile passes at 4400
concurrent clients, but `revokeCycle` P95 crossed 3 seconds and P99 crossed 4
seconds. That phase performs three sequential HTTP operations, so any load
generator connection queueing is multiplied inside one logical operation.

The 4400 probe used 22 ingress targets with `max-conns-per-host = 150`, which
caps the load generator at 3300 simultaneous client-side connections while the
logical concurrency is 4400. Before changing Identity business logic or
database limits, the refactor needs to prove whether that client transport cap
is distorting the tail.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay small, efficient, and
  stable for desktop operation.
- SDD 0080: performance conclusions must be registered as machine-readable
  evidence.
- SDD 0093: Dockerized load generation is the clean high-concurrency probe
  runtime.
- SDD 0097: 4400 clean-table pass evidence identified `revokeCycle` tail
  latency as the next bottleneck to explain.

## Scope

In scope:

- Run a comparable 4400 clean-table Dockerized benchmark with client
  `max-conns-per-host = 200` and `warm-connections-per-host = 200`.
- Keep gateway count, gateway DB pool size, ingress worker count, ingress
  upstream connection profile, PostgreSQL, and PgBouncer settings unchanged.
- Register the resulting report as transport-profile evidence.
- Compare the result to SDD 0097 before deciding whether to change runtime
  code or push to 4800.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing session revocation semantics.
- Raising PostgreSQL or PgBouncer limits.
- Introducing Redis, model dependencies, OCR, RAG, vector databases,
  embeddings, or training dependencies.
- Treating an empty endpoint or synthetic no-op endpoint as proof of capacity.

## Contracts

- The performance evidence registry requires
  `reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-upwarm22-clean-table-docker-bench.json`.
- The report must include `transportProfile.maxConnsPerHost = 200`.
- The report must include `benchmarkRuntimeProfile.executor = DOCKER_GO`.
- Registry status must match the source report status.

## Acceptance Criteria

- `npm run audit:performance-evidence` fails before the client-200 source
  report exists.
- The Identity session maintenance command runs successfully before the probe.
- The Dockerized 4400 client-200 probe writes a machine-readable report.
- The performance evidence registry records actual pass/fail status and key
  latency/error metrics.
- `npm run audit:performance-evidence` passes after the source report and
  registry are updated.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0098, the client-200 benchmark report, the registry entry, the
required-source audit addition, and the written performance summary. SDD 0097
remains the current 4400 clean-table pass baseline.

## Observability And Performance Evidence

Record:

- Red performance registry audit before the source report exists.
- Pre-probe session maintenance report.
- Dockerized 4400 client-200 benchmark report.
- Before/after comparison against SDD 0097 for phase P95/P99 and errors.
- `npm run audit:performance-evidence`, `npm test`, and `npm run quality`.
