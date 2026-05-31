# SDD 0097: Identity Clean-Table Upper-Bound Probe

## Problem

The current highest clean-table Identity HTTP evidence is a Dockerized
4000-concurrency run with zero phase errors. SDD 0096 proved that historical
inactive session rows distorted write-path evidence, but it did not prove where
the clean-table upper bound actually is.

The refactor needs a measured probe above 4000 before claiming support for
ultra-high concurrency or changing gateway, ingress, PostgreSQL, or PgBouncer
limits again.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay small, efficient, and
  stable for desktop operation.
- SDD 0080: performance claims must be registered as machine-readable evidence.
- SDD 0093: Dockerized load generation is the current clean runtime for 3200+
  Identity HTTP probes.
- SDD 0096: inactive session maintenance must run before future upper-bound
  probes.

## Scope

In scope:

- Register a clean-table Dockerized 4400-concurrency Identity HTTP probe as
  required performance evidence.
- Use the existing six-gateway, multi-ingress, PgBouncer-backed runtime profile
  so the result is comparable to the 4000 clean-table pass point.
- Run explicit inactive-session maintenance before the probe.
- Record the probe as `PASSED` or `FAILED` without redefining the result.
- Keep `npm test` Docker-free.

Out of scope:

- Changing public Identity HTTP contracts.
- Raising PostgreSQL or PgBouncer limits before the 4400 probe provides
  evidence.
- Removing the `revokeCycle` invalidation check from the workload.
- Adding Redis, external caches, model dependencies, OCR, RAG, vector
  databases, embeddings, or training dependencies.

## Contracts

- The performance evidence registry requires
  `reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client150-upwarm22-clean-table-docker-bench.json`.
- The report must include `benchmarkRuntimeProfile.executor = DOCKER_GO`.
- The report must include gateway, ingress, transport, and database pool
  profile metadata.
- Registry status must match the source report status.

## Acceptance Criteria

- `npm run audit:performance-evidence` fails before the 4400 source report
  exists.
- The Identity session maintenance command runs successfully before the probe.
- The Dockerized 4400-concurrency probe writes a machine-readable report.
- The performance evidence registry records the actual probe status and key
  latency/error metrics.
- `npm run audit:performance-evidence` passes after the source report and
  registry are updated.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0097, the 4400 probe report, the registry entry, the required-source
audit addition, and the written performance summary. SDD 0096 remains the
clean-table maintenance baseline.

## Observability And Performance Evidence

Record:

- Red performance registry audit before the source report exists.
- Maintenance report or command output proving the inactive-session table is
  clean before the probe.
- Dockerized 4400 benchmark report.
- Registry audit result after the report is registered.
- `npm test` and `npm run quality` results.
