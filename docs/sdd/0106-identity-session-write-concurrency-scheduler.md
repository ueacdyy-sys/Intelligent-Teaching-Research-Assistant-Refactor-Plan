# SDD 0106: Identity Session Write Concurrency Scheduler

## Problem

The current 4400-concurrency Identity evidence shows that reads are relatively
stable while mixed read/write phases still carry a high tail. SDD 0105 removed
generated-session-ID upsert work and improved revoke-cycle P95, but P99 still
regressed in the same benchmark profile.

The remaining evidence points at write scheduling and WAL pressure rather than
lock contention or simple connection fan-out:

- PostgreSQL wait timelines still include `WALWrite` and `WalSync` samples.
- Gateway DB pool acquisition waits remain material under pool12.
- PgBouncer after-snapshots show no queued clients and idle server capacity.
- Pool14 was already a negative tuning result.

The next safe step is to add a bounded, reversible write-concurrency scheduler
inside the Identity PostgreSQL adapter so write-heavy paths can be shaped
without changing public HTTP contracts or raising connection limits.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- Root requirement: packaging and runtime must stay compact, stable, and
  efficient.
- Root requirement: local performance secrets use `ueacd`.
- SDD 0104: PostgreSQL timeline evidence rejects lock contention and blind pool
  increases as the next action.
- SDD 0105: insert-only session saves improved revoke-cycle P95 but left P99
  unstable.

## Scope

In scope:

- Add optional `SESSION_DB_WRITE_CONCURRENCY` runtime configuration for the
  Identity PostgreSQL session store.
- Limit overlapping write statements when the setting is positive.
- Keep read lookups outside the write limiter.
- Pass the setting through the HTTP benchmark runner so Docker multi-gateway
  probes can compare shaped and unshaped write profiles.
- Record the setting in benchmark reports.

Out of scope:

- Changing public Identity HTTP contracts.
- Changing token or session semantics.
- Raising PostgreSQL, PgBouncer, gateway pool, or ingress limits.
- Adding Redis, caches, queues, model dependencies, OCR, RAG, vectors,
  embeddings, or training dependencies.
- Making the limiter a default until benchmark evidence proves the right value.

## Contracts Touched

- `SESSION_DB_WRITE_CONCURRENCY=0` or unset means no write limiter.
- A positive `SESSION_DB_WRITE_CONCURRENCY` limits concurrent PostgreSQL writes
  per gateway process.
- Reads through access-token or refresh-token lookup must not acquire the write
  limiter.
- Benchmark reports include per-worker and total write-concurrency settings.
- Benchmark runner child gateway processes receive the write-concurrency
  environment value.

## Acceptance Criteria

- A focused adapter test fails before implementation because
  `NewSessionStoreWithConfig` and the write limiter do not exist.
- A focused benchmark-runner test fails before implementation because
  `--session-db-write-concurrency` is not parsed or reported.
- Focused tests pass after implementation.
- `go test ./services/identity-access-gateway/internal/adapter/postgres -count=1`
  passes.
- `go test ./services/identity-access-gateway/... -count=1` passes.
- `npm run quality` passes.
- A Docker 4400 benchmark compares at least one shaped write-concurrency value
  with the SDD 0105 unshaped baseline before promoting any default.

## Benchmark Evidence

Docker 4400 probes were run with the same six-gateway, 22-ingress, pool12,
client200, PostgreSQL wait-timeline profile as SDD 0105:

| Profile | Status | Total duration | Delta vs SDD 0105 | Revoke P95 | Revoke P99 | Read P95 | Refresh P95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SDD 0105 insert-only baseline | PASSED | 222742.75ms | 0ms | 2659.94ms | 3121.35ms | 1172.88ms | 1305.65ms |
| `SESSION_DB_WRITE_CONCURRENCY=8` | PASSED | 239670.01ms | +16927.26ms | 2852.24ms | 3048.92ms | 1069.34ms | 1192.94ms |
| `SESSION_DB_WRITE_CONCURRENCY=10` | PASSED | 231647.48ms | +8904.73ms | 2788.92ms | 3128.61ms | 1036.12ms | 1202.66ms |

The shaped write profiles reduced gateway DB pool acquisition wait sharply:

| Profile | Total gateway acquire duration | Empty acquire count |
| --- | ---: | ---: |
| SDD 0105 insert-only baseline | 25302474.37ms | 51814 |
| `SESSION_DB_WRITE_CONCURRENCY=8` | 1510949.51ms | 21097 |
| `SESSION_DB_WRITE_CONCURRENCY=10` | 1423349.02ms | 25070 |

Interpretation:

- The scheduler works as a pressure-shaping control: DB pool waits collapse.
- The wait shifts into the application write queue, which is not yet exposed as
  first-class telemetry.
- `writeConcurrency=10` is better than `8`, but neither improves total
  mixed-workload throughput over the SDD 0105 insert-only baseline.
- The setting must remain opt-in and default to `0`.
- Future work should add write-limiter wait metrics and continue reducing write
  amplification or WAL pressure before considering any default promotion.

Evidence report:

- `reports/2026-05-31-p25-identity-session-write-concurrency-scheduler.md`

## Rollback Plan

Remove `SessionStoreConfig`, remove `SESSION_DB_WRITE_CONCURRENCY` from the
gateway and benchmark runner, and restore `NewSessionStore` as the only
constructor. Keep SDD 0105 as the current write-path optimization evidence.

## Observability And Performance Evidence

Record:

- Red/green focused adapter and runner tests.
- Green Identity gateway Go tests.
- Strict quality gate output.
- Follow-up 4400 benchmark evidence for a shaped write-concurrency value,
  including phase P95/P99, gateway DB pool waits, PgBouncer snapshots, and
  PostgreSQL wait timeline samples.
