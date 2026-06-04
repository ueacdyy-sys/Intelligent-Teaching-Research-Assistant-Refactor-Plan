# SDD 0211: Conversation Durable Command Fast-Lane

## Problem

The production10k mixed workload shows `conversation_write` as the current
largest interactive tail-latency hotspot. The synchronous request still waits
for PostgreSQL batch flush and insert completion, so tuning batch size or worker
count can move the bottleneck but cannot reliably prove a 50ms P99 pass target.

## Scope

- Keep the default `POST /v1/research/conversations` behavior synchronous and
  backward compatible.
- Add an explicit `durable-log` acceptance mode for the Conversation write
  gateway.
- In `durable-log` mode, validate the request, create the conversation ID, append
  a durable command record, then return `202 Accepted`.
- Project accepted commands into PostgreSQL asynchronously through the existing
  repository port.
- Make PostgreSQL conversation inserts idempotent so command-log replay is safe.
- Expose command-log diagnostics for accepted commands, queue depth, oldest
  pending age, projection successes, and projection failures.
- Extend the benchmark runner so fast-lane evidence is labeled separately from
  synchronous persistence evidence.

## Non-Scope

- Claiming the full Root SLO has reached 50ms or 10ms P99.
- Switching Identity or Teaching Archive write paths in this slice.
- Adding Redis, Kafka, vector stores, model-serving, or training dependencies.
- Treating a volatile in-memory queue as success before a recoverable command
  record exists.

## Contract

Default mode remains:

```http
201 Created
```

Fast-lane mode uses:

```http
202 Accepted
X-Conversation-Write-Acceptance: durable-log
```

The accepted response includes the target resource ID and command status:

```json
{
  "id": "conv_example",
  "command": {
    "id": "cmd_conv_example",
    "status": "accepted",
    "resourceId": "conv_example"
  }
}
```

## Configuration

- `CONVERSATION_WRITE_ACCEPTANCE_MODE=sync|durable-log`
- `CONVERSATION_COMMAND_LOG_PATH`
- `CONVERSATION_COMMAND_LOG_APPEND_BATCH_SIZE`
- `CONVERSATION_COMMAND_LOG_APPEND_DELAY_MS`
- `CONVERSATION_COMMAND_LOG_QUEUE_CAPACITY`
- `CONVERSATION_COMMAND_LOG_PROJECTION_WORKERS`
- `CONVERSATION_COMMAND_LOG_SYNC=true|false`

## Acceptance Criteria

- Unit tests prove the command-log repository returns after durable append and
  before slow projection finishes.
- Unit tests prove existing command logs can be replayed into the projection
  repository.
- HTTP tests prove `durable-log` mode returns `202 Accepted` and does not publish
  a created event before projection.
- Benchmark runner tests prove fast-lane runs expect `202` and report
  `acceptanceMode=durable-log`.
- Go and Node focused tests pass before performance evidence is recorded.

## Rollback

Set `CONVERSATION_WRITE_ACCEPTANCE_MODE=sync` to return to the previous
synchronous PostgreSQL write path. The command-log adapter is isolated behind
the existing repository port, so rollback does not require changing the HTTP
contract for default callers.
