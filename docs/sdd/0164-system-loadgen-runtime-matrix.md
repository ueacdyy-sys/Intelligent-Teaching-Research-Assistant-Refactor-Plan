# SDD 0164: System Loadgen Runtime Matrix

## Problem

P70 exposed `local|docker|wsl` Conversation loadgen placement through the
system mixed, sustained, and scale-up runners. The next performance question is
whether moving the Conversation load generator out of the Windows-local
process changes the full mixed workload bottleneck.

Without a runtime matrix, a single failed high-concurrency run can be
misread as either a gateway/database limit or a Windows load-generator/socket
limit. The system needs comparable evidence before changing default runtime
placement or claiming capacity headroom.

## Scope

In scope:

- Run the same sustained scale-up workload shape with Conversation loadgen
  runtime set to `local`, `wsl`, and `docker`.
- Compare smoke, `mixed800`, and `mixed1600` steps with the same gateway,
  database, transport, batching, and ingress settings.
- Record system P99, module P99, Conversation server timing, client/server gap,
  and database timing.
- Keep all generated benchmark reports as evidence.

Out of scope:

- Changing runtime defaults.
- Changing gateway counts, database pool sizes, write batching, identity
  ingress, or transport limits.
- Claiming ultra-high concurrency support.
- Enabling model, OCR, RAG, vector, embedding, training, or other heavy
  dependencies.

## Contracts

The runtime matrix treats each top-level scale-up JSON report as an evidence
contract. Each report must expose:

- `status` and `summary.totalErrors`.
- `conversationBenchmarkRuntimeProfile.executor`.
- One executed step with `maxP99Ms` and `workloads`.
- Workload summaries for `identity_http`, `conversation_write`, and
  `teaching_archive`.
- Conversation summary fields for `serverTimingP99Ms`,
  `clientServerGapP99Ms`, `dbAcquireP99Ms`, `dbBatchWaitP99Ms`, and
  `dbInsertP99Ms`.

## Protocol

Each runtime is measured with these steps:

```text
smoke:2:4:4:8:2:4
mixed800:800:1600:800:1600:40:80
mixed1600:1600:3200:1600:3200:80:160
```

Shared settings:

- `identityGatewayCount=12` and `conversationGatewayCount=16` for mixed steps.
- `identitySessionDbMaxConns=10` with unlogged session table persistence.
- `conversationDbMaxConns=1`, `teachingDbMaxConns=1`.
- `conversationWriteBatchSize=64`.
- `maxConnsPerHost=128`, `warmConnectionsPerHost=32`.
- Identity ingress enabled with 16 workers and bearer affinity preserved.

## Acceptance Criteria

- Local, WSL, and Docker runtime reports are present for smoke, `mixed800`, and
  `mixed1600`.
- Every matrix cell records status, total errors, system P99, Identity P99,
  Conversation P99, Teaching P99, Conversation server timing, client/server
  gap, and database timing.
- Docker cleanup leaves no `ita-identity-session` containers.
- The conclusion distinguishes loadgen placement effects from actual
  full-system capacity promotion.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` pass
  before commit.

## Rollback

Remove the P71 generated reports and narrative report. P70 runtime plumbing
remains available for future targeted probes.
