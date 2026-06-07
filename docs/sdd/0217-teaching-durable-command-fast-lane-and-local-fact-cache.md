# SDD 0217: Teaching Durable Command Fast-Lane And Local Fact Cache

## Problem

The production10k profile now needs to balance three constraints at the same
time:

- High read/write throughput under sustained mixed workloads.
- P99 below 50ms as the pass bar, with below 10ms as the excellent stretch bar.
- Teaching safety semantics: authorization, student scope, durable acceptance,
  read-your-write behavior, and projection diagnostics must not be weakened.

After Teaching moved to explicit `durable-log` acceptance, the first retest
still blocked the 50ms gate. The root cause was not command append latency.
`createQuizSubmission` still performed a PostgreSQL archive-item existence
lookup before accepting the command, producing DB acquire P99 up to 33.07ms and
client P99 up to 55.40ms.

## Source Requirement References

- Root requirements remain immutable:
  `C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`.
- The refactor is whole-system; Teaching is a delivery slice under the same
  root SLO, not an isolated benchmark toy.
- Local secrets remain `ueacd` and must stay masked in reports.
- Durable success must mean the command record is recoverable. In-memory queue
  acceptance alone is not success.
- Training, vector database, and model-serving dependencies remain outside this
  low-latency baseline.

## Scope

- Keep default Teaching write behavior synchronous unless
  `TEACHING_WRITE_ACCEPTANCE_MODE=durable-log` is explicitly configured.
- In durable-log mode, return `202 Accepted` only after the command record has
  been durably appended.
- Isolate benchmark command-log files per report so samples do not replay stale
  commands from previous runs.
- Use locally accepted durable archive commands as a bounded fact cache before
  consulting the PostgreSQL projection.
- Keep projection diagnostics and settled checks in the benchmark evidence.

## Contracts

- Default Teaching write APIs continue to return synchronous `201 Created`.
- Explicit durable-log mode returns `202 Accepted` only after durable command
  append succeeds.
- Accepted responses include a command identity so pending writes can be
  observed and reconciled.
- Quiz submission acceptance still requires a Teaching Quiz archive item. The
  fast path can satisfy that requirement from a local durable archive command;
  otherwise it must fall back to the PostgreSQL projection.
- Benchmark reports must include command-log diagnostics for before, after, and
  settled states.

## Non-Scope

- Claiming sub-10ms production P99 from this workstation evidence.
- Disabling command-log sync or database durability to improve benchmark
  numbers.
- Removing the quiz archive-item authorization and existence check.
- Replacing the production command log with Redis, Kafka, Milvus, Mem0, vLLM, or
  training infrastructure in this slice.

## Architecture Decision

Teaching durable-log mode now uses two fast paths:

1. **Durable command acceptance.** The HTTP handler validates principal and
   domain input, appends a recoverable command record, returns `202 Accepted`,
   and projects to PostgreSQL asynchronously.
2. **Local durable fact cache.** Once an archive item command is accepted, the
   command-log adapter remembers that full archive item as a bounded local fact
   cache. A follow-up quiz submission checks this local durable fact before
   querying the projection database.

This preserves safety because the cache is populated only after the archive item
has passed domain authorization and durable command append. It improves latency
because dependent quiz submissions no longer need to wait for PostgreSQL pool
acquire when the same gateway has already accepted the quiz archive command.

The cache is capped at 65,536 archive items. If the item is not present locally,
the adapter falls back to the PostgreSQL projection, so correctness does not
depend on cache hit.

## Benchmark Hygiene

Default Teaching command-log paths are now derived from the benchmark output
report and gateway port:

```text
reports/teaching-command-log/<report-derived-run-id>/teaching-<port>.jsonl
```

Before a durable-log benchmark starts, the runner clears only that
automatically generated report directory. Explicitly configured command-log
paths are not removed.

## Current Evidence

Blocked run before local fact cache:

```text
report = reports/system-sustained-mixed-workload-scaleup.production10k-teaching-durable-floor-10k-2samples-50ms.after-log-hygiene.current.json
read/write RPS = 17708.41
max P99 = 56.63ms
errors = 0
Teaching createQuizSubmission P99 = 55.40ms
Teaching createQuizSubmission db.acquire P99 = 33.07ms
```

Passing run after local fact cache:

```text
report = reports/system-sustained-mixed-workload-scaleup.production10k-teaching-durable-fastcache-floor-10k-2samples-50ms.current.json
read/write RPS = 23252.42
max P95 = 37.06ms
max P99 = 38.82ms
errors = 0
target = 10000 read/write RPS
status = PASSED
Teaching createQuizSubmission P99 = 18.38ms
Teaching createQuizSubmission server P99 = 4.16ms
```

Teaching command-log diagnostics were clean:

```text
before accepted=0 failed=0 queueDepth=0
settled accepted=320 failed=0 queueDepth=0
```

## Remaining Gap To 10ms

The current 50ms pass target is met. The 10ms excellent target is still not
proven under the strong durability profile. The remaining tail is now dominated
by:

- Conversation durable command append/fsync tail.
- Identity session database lookup and rotation tail.
- Client/server gap on this Windows workstation.

Sub-10ms under full mixed read/write pressure likely requires production-grade
Linux deployment, faster durable storage, tighter connection routing, and either
shared command-state infrastructure or stricter entity-affinity routing.

## Acceptance Criteria

- Teaching command-log benchmark paths are isolated per report and stale logs
  cannot contaminate samples.
- Adapter tests prove local accepted archive facts are checked before projection
  lookup.
- Teaching gateway tests pass.
- Production10k floor evidence proves at least 10k read/write RPS, zero errors,
  and max P99 below 50ms with durability kept enabled.

## Rollback

Set Teaching back to synchronous writes:

```text
TEACHING_WRITE_ACCEPTANCE_MODE=sync
```

The local fact cache is isolated inside the command-log adapter. Default
synchronous callers continue to use the PostgreSQL repository path.
