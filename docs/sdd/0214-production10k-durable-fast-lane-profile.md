# SDD 0214: Production10k Durable Fast-Lane Profile

## Problem

The active production target is now a two-tier interactive latency bar:

- P99 below 50ms is the current pass target.
- P99 below 10ms is the excellent target.

The current synchronous write architecture can reach high read/write RPS, but
it cannot reliably keep tail latency below 50ms when interactive requests wait
for durable PostgreSQL mutation, index maintenance, batching, and projection.
This is especially visible in Conversation write tests. More Go workers and
larger client concurrency help throughput, but they do not remove the durable
commit wait from the request path.

The `production10k` scale profile was still configured as Conversation
`sync`, even after SDD 0211 added a durable command fast-lane. That mismatch
made the official high-pressure profile test the wrong architecture for the
current latency goal.

## Source Requirement References

- Root requirements remain immutable:
  `C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`.
- Modules are delivery slices of the full-system refactor, not isolated PoCs.
- Current target evidence must come from sustained mixed read/write workloads
  with Docker/WSL multi-worker execution.
- Local secrets remain `ueacd` and must stay masked in reports.
- PostgreSQL durability must not be weakened for durable paths:
  `fsync=on`, `synchronous_commit=on`, and `full_page_writes=on` remain the
  safety baseline.

## Scope

- Enable Conversation `durable-log` acceptance in the `production10k` scale
  profile.
- Keep the default Conversation gateway behavior synchronous unless the
  explicit fast-lane mode is configured.
- Increase command-log queue and projection capacity in the production10k
  profile so target-10k pressure measures both acceptance latency and
  projection backlog.
- Keep Teaching Archive writes synchronous in this profile, because archive
  item creation and quiz submission flows still have immediate relational
  dependencies that are not safely modeled as commands in this slice.
- Preserve latency evidence as three separate numbers:
  - client end-to-end P99
  - service/server timing P99
  - durable command append and projection-lag metrics

## Contracts

- HTTP acceptance must return only after the command record is durably
  recoverable.
- Reports must preserve acceptance mode, command append latency, projection
  enqueue latency, queue depth, oldest pending age, projection successes, and
  projection failures.
- Reported database URLs and secrets must be masked.
- The default synchronous API behavior remains available unless the fast-lane
  mode is explicitly configured.

## Non-Scope

- Claiming the full system has reached the 50ms pass target before the current
  production10k report proves it.
- Claiming sub-10ms P99 from an empty endpoint, a local-only microbenchmark, or
  a weakened database durability mode.
- Moving Teaching Archive, Identity, Knowledge, or AI Worker onto async command
  acceptance in this slice.
- Adding Kafka, Redis Streams, vector stores, training dependencies, Mem0,
  Milvus, vLLM, or model-serving dependencies to the baseline.

## Architecture Decision

The production10k profile now treats Conversation writes as durable command
acceptance:

1. Validate request shape, domain constraints, principal scope, and idempotency
   at the HTTP boundary.
2. Append the command to a recoverable command log.
3. Return `202 Accepted` with command identity and target resource identity.
4. Project the command into PostgreSQL asynchronously.
5. Measure queue depth, oldest pending age, projection successes, projection
   failures, command append P99, projection enqueue P99, and final settled
   diagnostics.

This is the correct architecture for low-latency interactive acceptance because
the request no longer waits for the whole projection path. It is still safe
because success is not returned until the command has a recoverable durable
record.

Teaching Archive remains synchronous because its current root workflows need
immediate resource creation and follow-up quiz submission consistency. Moving
Teaching to a command model requires a later SDD that introduces explicit
command states, dependency IDs, read-your-write behavior, user-facing pending
states, retry/dead-letter semantics, and projection-lag UX.

## Configuration

The production10k profile sets:

```text
conversationWriteAcceptanceMode=durable-log
conversationCommandLogAppendBatchSize=128
conversationCommandLogQueueCapacity=262144
conversationCommandLogProjectionWorkers=8
conversationCommandLogSync=true
conversationCommandLogSettleTimeoutMs=30000
```

Default gateway behavior remains:

```text
CONVERSATION_WRITE_ACCEPTANCE_MODE=sync
```

## Acceptance Criteria

- Scale-up profile tests prove `production10k` carries Conversation
  `durable-log` settings into the target-10k workload.
- Sustained mixed workload tests prove reports preserve acceptance mode,
  command append P99, projection enqueue P99, queue depth, and settled
  diagnostics.
- Current production10k evidence is rerun with `maxP99Ms=50` so the report
  either proves the pass target or names the exact blocking workload.
- Quality gates pass after the profile and SDD changes.

## Rollback

Set the production10k profile back to:

```text
conversationWriteAcceptanceMode=sync
```

or run the scale-up command with:

```text
--conversation-write-acceptance-mode sync
```

Rollback restores synchronous Conversation creation without changing default
API callers, because the fast-lane is only enabled by explicit configuration.
