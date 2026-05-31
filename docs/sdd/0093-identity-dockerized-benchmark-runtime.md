# SDD 0093: Identity Dockerized Benchmark Runtime

## Problem

The current Identity HTTP service evidence has a verified 3000-concurrency
local pass point. The next 3200 safe-read retry probe no longer failed with
ingress 502 responses; it failed because the Windows-local load generator hit
client-side socket/buffer exhaustion while dialing local ingress ports.

That means the next high-concurrency probe needs a cleaner load-generation
runtime before it can honestly prove a new service boundary. Continuing to
raise Windows localhost concurrency would measure the benchmark client first,
not the refactored Identity boundary.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- SDD 0012: HTTP gateway benchmarks provide client-facing Identity performance
  evidence.
- SDD 0091: the six-gateway profile records gateway worker and database pool
  budget evidence.
- SDD 0092: safe-read retry preserved the 3000 pass point and moved the 3200
  probe from ingress 502s to Windows-local load generator exhaustion.

## Scope

In scope:

- Add an optional Docker benchmark runtime to the Identity HTTP benchmark
  runner.
- Keep the default benchmark runtime local and Docker-free for `npm test`.
- Convert loopback benchmark targets to `host.docker.internal` when the
  benchmark command runs inside Docker and the gateways/ingresses are still
  started by the host runner.
- Record the benchmark runtime profile in generated success and failure
  reports.
- Add a convenience npm script for Dockerized Identity HTTP benchmark probes.

Out of scope:

- Moving production gateway or ingress runtime into Docker.
- Claiming a new 3200+ service pass point without live evidence.
- Changing public Identity HTTP contracts.
- Changing PostgreSQL or PgBouncer limits.
- Introducing Redis, external caches, model dependencies, OCR, RAG, vector
  databases, embeddings, or training dependencies.

## Contracts

- Runner option `--benchmark-runtime local` keeps the existing behavior.
- Runner option `--benchmark-runtime docker` executes the Go `httpbench`
  command inside a Docker container.
- Docker benchmark mode uses a configurable image and host alias.
- Reports include `benchmarkRuntimeProfile.executor`.
- Docker benchmark runtime profile is evidence metadata only and is not part of
  the baseline application runtime.

## Acceptance Criteria

- A focused Node test fails before implementation because Docker benchmark
  command generation is missing.
- The runner can build a Docker command that mounts the repo, runs from
  `/workspace`, executes `go run ./services/identity-access-gateway/cmd/httpbench`,
  and maps loopback base URLs to `host.docker.internal`.
- Failure and success reports include the benchmark runtime profile.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0093, the Docker benchmark runtime options, the convenience npm
script, focused tests, and any future live Dockerized benchmark evidence. The
local benchmark runner and SDD 0092 evidence remain valid.

## Observability And Performance Evidence

Record:

- Red focused runner test before implementation.
- Focused runner test after implementation.
- Dockerized smoke benchmark proving the container load generator can reach the
  host-started gateway and write its report through the mounted workspace.
- Dockerized 3200+ probes may be registered only when their reports include
  the benchmark runtime profile and zero phase errors.
- `npm test` and `npm run quality` results.
