# SDD 0128: Conversation Dockerized Benchmark Runtime

## Problem

The Research conversation write gateway now has a strong local 5800-concurrency
pass point after batched inserts, 16 gateway workers, and a one-connection
application-side PostgreSQL pool per worker. The same slice also showed that
the remaining high-concurrency tail is no longer database acquisition:
`db.acquire` P99 stayed at or near 0ms, while the end-to-end tail was dominated
by client transport, listener scheduling, and Windows-local socket pressure.

That makes the next upper-bound claim unsafe if it is still produced only by a
Windows-local load generator. The benchmark runner needs an optional Docker
load-generation runtime so we can separate application limits from local client
runtime limits.

## Source Requirement References

- Root requirement: Research mode needs stable multi-model conversation
  persistence and high-concurrency desktop operation.
- SDD 0000: packaging and runtime must stay small, efficient, and stable; new
  language or runtime choices need contracts, tests, performance evidence, and
  rollback.
- SDD 0125: batched inserts removed write amplification in the conversation
  PostgreSQL adapter.
- SDD 0127: runtime connection diagnostics made listener pressure visible.

## Scope

In scope:

- Add an optional Docker benchmark runtime to the conversation write benchmark
  runner.
- Keep the default benchmark runtime local and Docker-free.
- Convert loopback benchmark targets to `host.docker.internal` when the
  benchmark command runs inside Docker and gateways or ingresses are still
  started by the host runner.
- Record the benchmark runtime profile in success and failure reports.
- Add a convenience npm script for Dockerized conversation write probes.

Out of scope:

- Moving the production conversation gateway, ingress proxy, PostgreSQL, or
  PgBouncer runtime into Docker.
- Promoting a new concurrency ceiling without live Dockerized evidence.
- Changing public Research conversation contracts.
- Changing PostgreSQL, PgBouncer, batching, or application database pool
  limits.
- Adding OCR, RAG, vector, embedding, model, or training dependencies to the
  baseline runtime.

## Contracts

- Runner option `--benchmark-runtime local` keeps the existing behavior.
- Runner option `--benchmark-runtime docker` executes the Go `httpbench`
  command inside a Docker container.
- Docker benchmark mode uses configurable `--benchmark-docker-image` and
  `--benchmark-docker-host` options.
- Reports include `benchmarkRuntimeProfile.executor`,
  `benchmarkRuntimeProfile.dockerImage`,
  `benchmarkRuntimeProfile.dockerHostAlias`, and
  `benchmarkRuntimeProfile.targetBaseUrls`.
- Docker benchmark runtime metadata is performance evidence metadata only. It
  is not part of the baseline application runtime.

## Acceptance Criteria

- A focused Node test fails before implementation because the conversation
  runner cannot build a Docker benchmark command and cannot describe Docker
  benchmark runtime metadata.
- The runner can build a Docker command that mounts the repo, runs from
  `/workspace`, executes
  `go run ./services/conversation-write-gateway/cmd/httpbench`, and maps
  loopback base URLs to `host.docker.internal`.
- Success and failure reports include the benchmark runtime profile.
- `npm test` remains Docker-free.
- Focused Node tests and conversation Go tests pass.
- `npm run quality` passes before promotion.

## Rollback

Remove SDD 0128, the Docker benchmark runtime options, the convenience npm
script, and any future Dockerized conversation benchmark evidence. The existing
local benchmark runner and SDD 0127 runtime diagnostics remain valid.

## Observability And Performance Evidence

Record:

- Red focused runner test before implementation.
- Focused runner test after implementation.
- Optional Dockerized smoke benchmark proving the container load generator can
  reach host-started gateways and write a report through the mounted workspace.
- Any future upper-bound evidence only when the report includes
  `benchmarkRuntimeProfile.executor = DOCKER_GO`, zero createConversation
  errors, and runtime diagnostics for every gateway worker.
