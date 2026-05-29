# SDD 0011: Identity Session Concurrency Benchmark

## Problem

Identity durable sessions now have real PostgreSQL/PgBouncer correctness evidence. The next risk is performance under concurrent teacher, student, and remote command entry traffic. A single lifecycle test proves correctness, but it does not show whether access lookup, refresh rotation, or revoke cycles become the next bottleneck.

The refactor needs a repeatable benchmark that runs against the identity-only PgBouncer runtime profile and emits structured latency evidence.

## Source Requirement References

- Root requirement: teacher login, student app login, and remote/social command entry must remain stable for desktop, mobile, and remote command use.
- SDD 0010: Identity sessions have a non-conflicting PgBouncer runtime profile on host port `16432`.
- P0b connection budget: database-using services must produce capacity evidence before high-concurrency claims.

## Scope

In scope:

- Add a Go benchmark command under the identity gateway module.
- Measure three durable session phases:
  - access-token lookup
  - refresh-token rotation
  - revoke cycle, including save, revoke, and revoked lookup verification
- Emit JSON with operations, errors, RPS, average, P50, P95, P99, min, and max latency.
- Add a Node runner with default PgBouncer DSN and report path.
- Add a summary tool that compares reports and de-duplicates repeated runs for the same concurrency and pool size.
- Keep root unit tests Docker-free.

Out of scope:

- HTTP endpoint benchmarking.
- Full legacy plus Go mixed-load benchmarking.
- Modeling actual WeChat callback traffic.
- Defining final production SLOs.

## Contracts

- Command: `go run ./services/identity-access-gateway/cmd/sessionbench`
- Script: `npm run bench:identity-session:pgbouncer`
- Summary script: `npm run summary:identity-session-benchmark`
- Report: `reports/identity-session-benchmark.current.json`

## Acceptance Criteria

- Pure benchmark math has unit tests.
- The benchmark fails fast if the DSN is missing or unreachable.
- The benchmark cleans up rows it creates.
- The report masks the database password.
- The report contains separate phase metrics for lookup, refresh rotation, and revoke cycle.
- Root `npm test` passes.
- With the identity-only PgBouncer profile running, the benchmark completes and writes the report.

## Rollback

The benchmark is a standalone command. Stop the identity runtime profile with:

```powershell
npm run perf:identity-session:down
```

No production routing depends on this command.

## Observability And Performance Evidence

Each run records:

- configured concurrency
- operations per phase
- total duration
- per-phase error count
- per-phase RPS
- per-phase average, P50, P95, P99, min, max latency
- masked DSN target
