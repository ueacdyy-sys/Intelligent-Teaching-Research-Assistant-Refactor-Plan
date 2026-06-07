# SDD 0215: Production10k Persistence Domain Isolation

## Problem

The latest production10k evidence showed that the system can exceed 10k
mixed read/write RPS, but the P99 latency guardrail still fails:

- Best shared-database result measured in the current round: about 26k
  read/write RPS with max P99 around 75ms.
- P99 below 50ms is the production pass target.
- P99 below 10ms is the excellent stretch target.

The dominant tail latency no longer comes from a cold Identity pool. It comes
from shared PostgreSQL/PgBouncer write pressure across Identity, Conversation,
and Teaching. Raising Go workers or client concurrency increases throughput,
but it also makes the three write-heavy workflows compete for the same durable
database backend.

## Source Requirement References

- Root requirements remain immutable:
  `C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`.
- The refactor is whole-system. Identity, Conversation, Teaching, Knowledge,
  and AI Worker are module delivery slices, not isolated PoCs.
- Business and safety semantics must not be weakened to win a benchmark.
- Local secrets remain `ueacd` and must be masked from reports.
- Model training dependencies remain out of scope for this runtime benchmark.
- Durable PostgreSQL paths keep production safety assumptions; this SDD does
  not switch to unsafe commit settings.

## Scope

- Allow the system mixed workload runner to pass separate PostgreSQL DSNs for:
  - Identity session persistence
  - Conversation write persistence
  - Teaching archive and quiz persistence
- Add a report-level `persistenceProfile` that identifies whether the run used
  `shared`, `mixed`, or `isolated` persistence domains without exposing
  passwords or raw database URLs.
- Add a Docker performance stack with three independent
  PostgreSQL+PgBouncer domains on separate local ports.
- Keep the old single-database stack as the default compatibility path.

## Contracts

- Identity, Conversation, and Teaching must accept independent PostgreSQL DSNs
  through the mixed, sustained, and scale-up workload runners.
- Reports must expose `persistenceProfile.mode` as `shared`, `mixed`, or
  `isolated` without exposing raw passwords.
- Docker Compose service names, ports, users, databases, and PgBouncer pool
  modes remain part of the executable performance contract.
- Business modules must continue to see persistence as an outer adapter
  detail; domain/use-case code must not depend on the deployment topology.

## Non-Scope

- Claiming the system has passed 50ms before a production10k isolated-domain
  benchmark proves it.
- Claiming sub-10ms production readiness from empty endpoints, local-only
  microbenchmarks, or weakened data durability.
- Replacing PostgreSQL with a different database in this slice.
- Adding Kafka, Redis Streams, vector stores, Mem0, Milvus, vLLM, training
  dependencies, or model-serving dependencies.
- Rewriting Teaching synchronous workflows into commands before read-your-write,
  pending states, retry, dead-letter, and projection-lag UX are modeled.

## Architecture Decision

Introduce persistence-domain isolation as an explicit performance architecture
variant:

1. Identity session writes use their own PostgreSQL+PgBouncer domain.
2. Conversation command/write persistence uses its own PostgreSQL+PgBouncer
   domain.
3. Teaching archive and quiz writes use their own PostgreSQL+PgBouncer domain.
4. The benchmark runner passes all three DSNs through the sustained and
   scale-up orchestration layers.
5. Reports record the topology as `persistenceProfile.mode`.

This is an architecture-level optimization because it removes cross-module
write interference while preserving each module's current business contract.
It also keeps the clean boundary between application use cases and persistence
adapters: the business modules still depend on a DSN-backed repository at the
outer edge, while the deployment topology can evolve independently.

## Configuration

The isolated local stack exposes:

```text
Identity:     postgres://app_user:ueacd@127.0.0.1:16432/intelligent_teaching_assistant?sslmode=disable
Conversation: postgres://app_user:ueacd@127.0.0.1:16433/intelligent_teaching_assistant?sslmode=disable
Teaching:     postgres://app_user:ueacd@127.0.0.1:16434/intelligent_teaching_assistant?sslmode=disable
```

Start/reset commands:

```text
npm run perf:system-persistence:reset
npm run perf:system-persistence:up
```

The original single-domain stack remains:

```text
npm run perf:identity-session:reset
npm run perf:identity-session:up
```

The `production10k` profile now defaults to:

```text
dockerStack=system-persistence
identityGatewayCount=2
conversationGatewayCount=4
teachingGatewayCount=2
identitySessionDbMaxConns=8
identitySessionDbMinConns=8
identitySessionDbPrewarmConns=8
identitySessionDbWriteConcurrency=8
identityBenchmarkRuntime=local
conversationBenchmarkRuntime=local
teachingBenchmarkRuntime=local
teachingDbMaxConns=16
teachingDbMinConns=16
teachingDbPrewarmConns=16
teachingArchiveCreateBatchWorkers=4
teachingQuizSubmissionBatchWorkers=4
teachingClientTrace=false
```

## Current Evidence

After this SDD slice, the benchmark runner was corrected so the Identity
`revokeCycle` measures the real revoke-and-verify workflow, not the test
fixture login used to create a session. The login setup is still executed, but
it is outside the measured revoke phase.

Measured on the isolated three-domain Docker stack:

```text
floor-10k-id4-fixturefix:
  read/write RPS = 17078.03
  max P99 = 49.73ms
  errors = 0
  result = PASSED

mid-20k-id4-fixturefix:
  read/write RPS = 22515.94
  max P99 = 46.92ms
  errors = 0
  result = PASSED

high-17k-id4-fixturefix:
  read/write RPS = 23131.92
  max P99 = 59.33ms
  errors = 0
  result = BLOCKED by 50ms guardrail

floor-10k-half-gw:
  read/write RPS = 18137.44
  max P99 = 45.35ms
  errors = 0
  result = PASSED

floor-10k-half-gw-2samples:
  read/write RPS = 17171.54
  max P99 = 68.26ms
  errors = 0
  result = BLOCKED by 50ms guardrail

floor-10k-quarter-gw-2samples:
  read/write RPS = 18667.28
  max P99 = 54.24ms
  errors = 0
  result = BLOCKED by 50ms guardrail

floor-10k-id8-convlocal-teach2-local:
  read/write RPS = 23698.74
  max P99 = 45.65ms
  errors = 0
  result = PASSED

floor-10k-alllocal-balanced:
  read/write RPS = 26723.71
  max P99 = 38.55ms
  errors = 0
  result = PASSED

floor-10k-default-balanced:
  read/write RPS = 24852.36
  max P99 = 43.96ms
  errors = 0
  result = PASSED
```

The current code can exceed the 10k target and now has a two-sample
target-pressure pass below 50ms on this Windows Docker/WSL workstation. The
winning profile is not "more workers everywhere": Teaching became stable only
after the profile reduced per-gateway batch worker fragmentation, while
Conversation and Identity improved after removing Docker/WSL load-generator
paths for this workstation. Docker remains the persistence runtime for the
three PostgreSQL+PgBouncer domains.

## Acceptance Criteria

- Unit tests prove all three DSNs parse, propagate into child workload
  commands, and survive scale-profile defaulting.
- Reports include `persistenceProfile.mode` and never expose raw
  `postgres://app_user:...` URLs or `ueacd`.
- Docker Compose can start three independent PostgreSQL+PgBouncer domains.
- The production10k scale-up benchmark is rerun with `maxP99Ms=50` and
  explicit isolated DSNs.
- Promotion is allowed only if the sustained mixed read/write report proves:
  - read/write RPS is at least 10k,
  - total errors are zero,
  - max P99 is below 50ms,
  - root workflow slices remain covered.

## Rollback

Run the existing single-domain profile by omitting the explicit DSNs or by
using the default identity-session Docker stack. The application modules do
not need code rollback because the change is expressed through deployment and
benchmark configuration.
