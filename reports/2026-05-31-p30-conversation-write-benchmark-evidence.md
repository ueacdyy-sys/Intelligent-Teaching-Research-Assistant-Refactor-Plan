# P30 Conversation Write Benchmark Evidence

## Scope

This slice moves the Research conversation creation path from contract-only
coverage to repeatable performance evidence. It keeps the work inside the
whole-system refactor boundary from SDD 0000 and SDD 0001: Go owns the hot
write path, PostgreSQL remains behind PgBouncer, and optional AI/model
dependencies stay out of the baseline runtime.

## Code And Contract Changes

- Added `contracts/sql/research-conversations.sql` for the minimum
  `research_conversations` table and indexes.
- Added `postgres.EnsureSchema` behind a small `DB` executor port and wired it
  into `cmd/gateway` startup.
- Added `services/conversation-write-gateway/cmd/httpbench` for deterministic
  HTTP write benchmarks.
- Added `npm run bench:conversation-write:http` as the reproducible benchmark
  command entry.
- Registered current pass and limit-probe reports in
  `contracts/ops/performance-evidence-registry.current.json`.

## Red To Green Evidence

Focused benchmark tests first failed because `cmd/httpbench/main.go` was
missing:

```text
undefined: summarizeLatencies
undefined: buildPhaseReport
undefined: parseBaseURLs
undefined: benchmarkConfig
undefined: buildHTTPClient
undefined: reportStatus
```

Green checks after implementation:

```text
go test ./services/conversation-write-gateway/cmd/httpbench -count=1
ok ita-refactor/services/conversation-write-gateway/cmd/httpbench

go test ./services/conversation-write-gateway/internal/adapter/postgres -run "EnsureSchema|RepositoryCreate" -count=1
ok ita-refactor/services/conversation-write-gateway/internal/adapter/postgres

go test ./services/conversation-write-gateway/... -count=1
ok
```

## Runtime Profile

- PostgreSQL container: `ita-identity-session-postgres`
- PostgreSQL settings: `max_connections=300`, `shared_buffers=1GB`
- PgBouncer container: `ita-identity-session-pgbouncer`
- PgBouncer settings: `pool_mode=transaction`, `max_db_connections=90`
- Gateway DB pool: `DB_MAX_CONNS=8`
- Local secrets: `AGENT_API_KEY=ueacd`, PostgreSQL password `ueacd`
- Benchmark cleanup:

```text
DELETE FROM research_conversations WHERE title LIKE 'bench conversation %';
```

## Scale Curve

Single gateway:

- 800 concurrency / 1600 operations: failed with connection refusals.
- First error: `connectex: No connection could be made because the target machine actively refused it`.

Four gateways:

- 1200 concurrency / 2400 operations: passed, 0 errors, 4857.06 RPS, P95 302.30ms.
- 1400 concurrency / 2800 operations: passed, 0 errors, 5468.70 RPS, P95 260.33ms.
- 1500 concurrency / 3000 operations: failed, 222 errors, first error was connection refused.
- 1600 concurrency / 3200 operations: failed, 216 errors, first error was connection refused.
- 2000 concurrency / 4000 operations: failed, 460 errors, P95 585.70ms.

Six gateways:

- 2000 concurrency / 4000 operations: passed, 0 errors, 4751.59 RPS, P95 436.41ms.
- 2200 concurrency / 4400 operations: passed, 0 errors, 5696.71 RPS, P95 405.09ms.
- 2300 concurrency / 4600 operations: failed, 95 errors, first error was connection refused.
- 2400 concurrency / 4800 operations: failed, 445 errors, P95 708.01ms.

## Current Assessment

The current Research conversation write path exceeds the SDD 0001 target of
800 concurrency, above 2000 RPS, P95 below 500ms, and zero errors when it is
run as multiple Go gateway processes through PgBouncer. The strongest local
pass point in this slice is 2200 concurrency with six gateways.

The limiting factor is not PostgreSQL write throughput in the measured profile:
PgBouncer showed active gateway client pools and no waiting queue before the
tests, and failed probes reported HTTP transport connection refusals. The next
performance work should focus on ingress fan-out, listener/socket backlog
diagnostics, or a real reverse proxy profile before increasing database pools.

## Evidence Files

- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.concurrency1400-multi4.json`
- `reports/conversation-write-http-benchmark.concurrency1500-multi4.json`
- `reports/conversation-write-http-benchmark.concurrency1600-multi4.json`
- `reports/conversation-write-http-benchmark.concurrency2000-multi4.json`
- `reports/conversation-write-http-benchmark.concurrency2000-multi6.json`
- `reports/conversation-write-http-benchmark.concurrency2200-multi6.json`
- `reports/conversation-write-http-benchmark.concurrency2300-multi6.json`
- `reports/conversation-write-http-benchmark.concurrency2400-multi6.json`

## Remaining Gates

- `npm run audit:performance-evidence`
- `npm run quality`
