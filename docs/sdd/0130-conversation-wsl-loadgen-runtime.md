# SDD 0130: Conversation WSL Load Generator Runtime

## Problem

SDD 0129 proved that Dockerized load generation can push the Research
conversation write path to a 7000-concurrency zero-error functional probe, but
Docker Desktop networking made the client/server gap dominate end-to-end tail
latency. The previous Windows-local benchmark had much better low-tail latency
at 5800 concurrency but hit Windows-local socket pressure at higher probes.

The next capacity claim needs a load generator that avoids both constraints:
Windows localhost socket pressure and Docker Desktop host networking overhead.
WSL2 is the smallest local next step because it can run a native Linux Go
`httpbench` process while the host runner still starts gateway workers,
PgBouncer, and PostgreSQL exactly as the current performance profile expects.

## Source Requirement References

- Root requirement: Research mode needs stable, efficient multi-model
  conversation persistence under high-concurrency desktop operation.
- SDD 0000: runtime choices must stay small, efficient, stable, reversible,
  and backed by contracts, tests, and evidence.
- SDD 0125: batched inserts reduced write amplification in the conversation
  PostgreSQL adapter.
- SDD 0127: gateway runtime diagnostics expose listener and connection
  pressure.
- SDD 0128: benchmark runtime selection is evidence tooling, not baseline
  application runtime.
- SDD 0129: Dockerized load generation is useful for functional capacity but
  not suitable for promoting a low-tail ceiling on this Windows desktop.

## Scope

In scope:

- Add an optional `wsl` benchmark runtime to the conversation write benchmark
  runner.
- Keep the default benchmark runtime local and Docker-free.
- Convert loopback benchmark targets to a configurable WSL host alias when the
  load generator runs inside WSL.
- Record WSL runtime metadata in success and failure reports.
- Add a convenience npm script for WSL conversation write probes.

Out of scope:

- Moving production gateways, ingress proxies, PostgreSQL, or PgBouncer into
  WSL.
- Installing OCR, RAG, vector, embedding, model, training, or GPU dependencies.
- Changing public Research conversation API contracts.
- Changing PostgreSQL, PgBouncer, batching, or application database pool
  limits.
- Promoting a new concurrency ceiling before live WSL evidence exists.

## Contracts

- `--benchmark-runtime local` keeps the existing host Go behavior.
- `--benchmark-runtime docker` keeps the SDD 0128 Docker behavior.
- `--benchmark-runtime wsl` executes the Go `httpbench` command through
  `wsl.exe -d <distro> -- bash -lc ...`.
- WSL mode supports:
  - `--benchmark-wsl-distro`, default `Ubuntu`;
  - `--benchmark-wsl-host`, default `host.docker.internal`;
  - `--benchmark-wsl-workspace`, optional override for the mounted repo path.
- The current desktop npm convenience script pins `--benchmark-wsl-host
  172.28.160.1` because Ubuntu WSL2 resolves `host.docker.internal` to the
  Docker Desktop host path, not the host-started gateway listeners.
- If no WSL workspace override is supplied, the runner converts a Windows repo
  root such as `C:\Users\...\repo` to `/mnt/c/Users/.../repo`.
- Reports include `benchmarkRuntimeProfile.executor = WSL_GO`,
  `wslDistro`, `wslHostAlias`, `wslWorkspace`, and sanitized
  `targetBaseUrls`.
- WSL Go is a benchmark tool dependency only. It is not part of the baseline
  application runtime or packaged product.

## Acceptance Criteria

- A focused Node test fails before implementation because the runner cannot
  build a WSL benchmark command and cannot describe WSL runtime metadata.
- The runner can build a WSL command that changes into the mounted workspace,
  executes `go run ./services/conversation-write-gateway/cmd/httpbench`, and
  maps loopback targets to the configured WSL host alias.
- Docker and local benchmark runtime behavior remains unchanged.
- `npm test` remains Docker-free and WSL-free.
- Focused runner tests pass.
- `npm run quality` passes before any new WSL evidence is promoted.

## Rollback

Remove SDD 0130, the WSL benchmark runtime options, the convenience npm script,
and any future WSL benchmark reports. SDD 0128 Dockerized evidence tooling and
SDD 0129 Dockerized functional capacity evidence remain valid.

## Observability And Performance Evidence

Record for future live probes:

- WSL distro, workspace, host alias, and target URLs;
- concurrency, operations, RPS, P95, P99, and phase errors;
- server-side P99 and Server-Timing breakdown;
- DB acquire P99;
- gateway runtime diagnostics for every worker;
- PgBouncer and PostgreSQL snapshots;
- whether WSL reduces the client/server gap compared with both Windows-local
  and Dockerized load generation.
