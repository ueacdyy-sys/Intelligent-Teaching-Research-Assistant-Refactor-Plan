# SDD 0114: Conversation Write Benchmark Runner

## Problem

SDD 0113 proved the Research conversation write path can exceed the SDD 0001
performance target when traffic is distributed across multiple Go gateway
processes. The strongest local pass point was six gateways at 2200 concurrency,
while the next probe failed at the HTTP ingress connect layer.

That evidence is useful, but the current workflow still relies on manually
starting gateway processes, hand-building a comma-separated base URL list, and
copying benchmark reports. A whole-system refactor needs the performance
profile to be reproducible by command, not by operator memory.

## Source Requirement References

- Root requirement: runtime must be efficient, stable, and suitable for a
  compact packaged application.
- SDD 0001: Research conversation creation is the first Go hot-path migration
  candidate.
- SDD 0113: the next Research write-path optimization is gateway fan-out and
  ingress/listener diagnostics before increasing database pools.

## Scope

In scope:

- Add a Node runner that starts one or more local conversation-write gateway
  processes with explicit PgBouncer, DB pool, and `ueacd` secret settings.
- Generate deterministic gateway base URLs from a base URL plus gateway count.
- Run the Go `cmd/httpbench` benchmark against the generated target URLs.
- Write machine-readable FAILED reports when startup or benchmark execution
  fails.
- Add runtime profile metadata to PASSED and FAILED reports so registry entries
  can explain gateway count and DB pool settings.

Out of scope:

- Adding a production reverse proxy.
- Changing database schema beyond SDD 0113.
- Increasing PostgreSQL or PgBouncer pool sizes.
- Migrating messages, RAG, multi-model fusion, or optional AI workers.

## Contracts Touched

- `tools/run-conversation-write-benchmark.mjs` becomes the reproducible local
  performance runner for the Research conversation write path.
- `package.json` exposes the runner as `bench:conversation-write:pgbouncer`.
- `reports/conversation-write-http-benchmark.current.json` remains the current
  source report, now produced by the runner.

## Acceptance Criteria

- Runner tests fail before implementation because argument parsing, target URL
  generation, failure report building, and runtime report enrichment are
  missing.
- The runner validates local performance secrets and masks them from failure
  evidence.
- The runner can launch multiple gateway processes and stop them after the
  benchmark.
- A live PgBouncer-backed runner execution reproduces the current multi-gateway
  performance evidence.
- `npm run audit:performance-evidence` passes.
- `npm run quality` passes.

Current evidence update:

- Runner-managed six-gateway 1800, 1900, 1950, 2000, and 2100 concurrency runs
  passed with zero errors.
- Runner-managed 2200 concurrency failed with connection refusals while all
  gateway process exit codes remained `null`.
- The current reproducible pass point is therefore 2100 concurrency, 5351.62
  RPS, P95 404.20ms, and zero errors.
- This runner evidence supersedes the earlier manual long-running process claim
  for the current performance registry entry.

## Rollback

Remove the runner, package script, runner-produced report changes, and this SDD.
The lower-level Go `cmd/httpbench` command from SDD 0113 remains usable for
manual benchmarks.
