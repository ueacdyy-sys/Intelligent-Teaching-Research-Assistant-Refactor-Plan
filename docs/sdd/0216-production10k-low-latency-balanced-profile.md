# SDD 0216: Production10k Low-Latency Balanced Profile

## Problem

The isolated persistence stack proved that the refactored system can exceed
10k mixed read/write RPS, but the 50ms P99 guardrail was not stable when the
runtime profile was tuned only for higher throughput.

The latest blocked profiles showed three different failure modes:

- `floor-10k-quarter-gw-2samples`: 18,667.28 read/write RPS, zero errors,
  max P99 54.24ms. Teaching synchronous write tail was the blocker.
- `floor-10k-teach4-db32-local`: 12,183.37 read/write RPS, zero errors,
  max P99 111.20ms. Four Teaching gateways fragmented the small floor workload
  across too many per-gateway batch workers and raised DB exec tail latency.
- `floor-10k-id8-teach2-db16-workers4-local`: 16,316.50 read/write RPS,
  zero errors, max P99 50.63ms. Identity DB8 fixed most session wait, but the
  remaining margin was too small for the 50ms gate.
- `floor-10k-alllocal-balanced`: 26,723.71 read/write RPS, zero errors,
  max P99 38.55ms. Keeping the Docker persistence stack but running all Go
  load generators locally removed the remaining cross-VM client/server gap on
  this workstation.

## Source Requirement References

- Root requirements remain immutable:
  `C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`.
- The refactor is whole-system. Identity, Conversation, Teaching, Knowledge,
  and AI Worker are delivery slices under one system SLO.
- Business and safety semantics must not be weakened to win the benchmark.
- Local secrets remain `ueacd`; reports and docs must mask credentials.
- Training, vector-store, model-serving, and heavy AI runtime dependencies stay
  outside this low-latency baseline.

## Scope

- Tune the `production10k` scale profile for sustained mixed read/write
  pressure on the isolated PostgreSQL+PgBouncer persistence stack.
- Keep the benchmark target on full-system slices: Identity, Conversation,
  Teaching, Knowledge, and AI Worker admission.
- Preserve synchronous Teaching as the default API behavior while allowing the
  explicit Teaching durable-log profile described in SDD 0217.
- Treat sub-50ms P99 as the current pass bar and sub-10ms P99 as the excellent
  stretch bar.

## Contracts

- The `production10k` defaults must carry the balanced gateway, DB pool,
  write limiter, batch worker, cache, and local load-generator profile.
- Current evidence must report read/write RPS, max P95, max P99, zero-error
  status, and per-module P99 values.
- The profile must not weaken safety settings or remove authorization,
  principal, diagnostics-secret, or credential-masking checks.
- Promotion claims remain blocked unless root workflow coverage, performance
  evidence registry, strict quality, and root SLO review also pass.

## Architecture Decision

Use a balanced low-latency `production10k` profile:

1. Keep three isolated PostgreSQL+PgBouncer write domains.
2. Keep Identity on two gateway processes behind ingress, but raise the session
   DB pool and write limiter from 4 to 8 per gateway.
3. Keep Conversation's durable command fast lane, but run the Identity,
   Conversation, and Teaching load generators locally on this workstation
   because Docker/WSL load generation added client/server gap tail.
4. Run Teaching with two gateway processes, not four, and set each gateway to
   16 DB connections with 4 archive workers and 4 quiz workers.
5. Keep Teaching synchronous read-your-write behavior as the default. The later
   SDD 0217 profile adds explicit durable-log acceptance with pending command
   semantics and local durable fact caching for the production10k fast lane.

This is an architecture-level optimization: it aligns each module's deployment
shape with its actual bottleneck. More gateways improved isolated Teaching
throughput at high per-module concurrency, but hurt the full-system 10k floor
because per-gateway batchers became under-filled and over-parallelized.

## Production10k Profile

```text
dockerStack=system-persistence
identityGatewayCount=2
conversationGatewayCount=4
teachingGatewayCount=2

identityBenchmarkRuntime=local
identitySessionDbMaxConns=8
identitySessionDbMinConns=8
identitySessionDbPrewarmConns=8
identitySessionDbWriteConcurrency=8

conversationDbMaxConns=8
conversationBenchmarkRuntime=local
conversationWriteAcceptanceMode=durable-log
conversationWriteBatchMode=copy
conversationWriteBatchSize=128
conversationWriteBatchWorkers=4

teachingBenchmarkRuntime=local
teachingDbMaxConns=16
teachingDbMinConns=16
teachingDbPrewarmConns=16
teachingArchiveCreateBatchSize=4
teachingArchiveCreateBatchWorkers=4
teachingQuizSubmissionBatchSize=4
teachingQuizSubmissionBatchWorkers=4
teachingArchiveSchemaIndexProfile=hot_write
teachingArchiveListCacheTtlMs=250
```

## Current Evidence

Current best command:

```text
node tools/run-system-sustained-mixed-workload-scaleup.mjs --scale-profile production10k --steps floor-10k-alllocal-balanced:80:160:320:640:80:160:10000 --samples 2 --max-p99-ms 50 --identity-benchmark-runtime local --conversation-benchmark-runtime local --teaching-benchmark-runtime local --manage-docker false --docker-cleanup none
```

Result:

```text
read/write RPS = 26723.71
max P99 = 38.55ms
errors = 0
target = 10000 read/write RPS
status = PASSED
```

Slowest module summaries:

```text
Identity HTTP P99 = 35.98ms
Conversation Write P99 = 25.72ms
Teaching Archive P99 = 38.55ms
```

Official default-profile rerun after applying this SDD:

```text
report = reports/system-sustained-mixed-workload-scaleup.production10k-default-final-sustained.current.json
read/write RPS = 24852.36
max P95 = 40.38ms
max P99 = 43.96ms
errors = 0
target = 10000 read/write RPS
status = PASSED
Identity HTTP P99 = 36.57ms
Conversation Write P99 = 27.67ms
Teaching Archive P99 = 43.96ms
```

Superseding Teaching durable-log evidence from SDD 0217:

```text
report = reports/system-sustained-mixed-workload-scaleup.production10k-teaching-durable-fastcache-floor-10k-2samples-50ms.current.json
read/write RPS = 23252.42
max P99 = 38.82ms
errors = 0
Teaching createQuizSubmission P99 = 18.38ms
```

## Acceptance Criteria

- `production10k` defaults carry the balanced profile above.
- Scale-up tests prove the target step receives the new defaults.
- A two-sample target-pressure run proves at least 10k read/write RPS, zero
  errors, and max P99 below 50ms.
- Root promotion still requires root workflow coverage and evidence registry
  audits; this SDD alone is not a full production promotion.

## Rollback

Restore the previous profile:

```text
identitySessionDbMaxConns=4
identitySessionDbWriteConcurrency=4
identityBenchmarkRuntime=docker
conversationBenchmarkRuntime=wsl
teachingGatewayCount=1
teachingDbMaxConns=8
teachingArchiveCreateBatchWorkers=8
teachingQuizSubmissionBatchWorkers=8
```
