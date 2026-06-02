# SDD 0162: System Conversation Runtime Diagnostics Rollup

## Problem

P68 showed that `identitySessionDbWriteConcurrency=10` is not a usable full
mixed optimization on this Windows/Docker profile. The failed full mixed runs
also exposed a reporting gap: the Conversation child benchmark already records
gateway exit codes, runtime connection diagnostics, database pool diagnostics,
server timing, and client/server gap metrics, but the system mixed rollup only
keeps a narrow latency/error summary.

That makes root-cause review harder at the system level. A failed rollup can
look like a generic Conversation write failure even when the child evidence
shows the gateway processes stayed alive, the database acquire path was not the
main bottleneck, and the failure was closer to client/socket/listener pressure.

## Scope

In scope:

- Add a concise Conversation diagnostics summary to the system mixed workload
  `conversation_write` workload summary.
- Preserve that summary through sustained mixed workload sample rollups.
- Preserve a merged summary through sustained scale-up step rollups.
- Keep the summary sanitized and bounded.

Out of scope:

- Changing Conversation gateway behavior.
- Changing load, worker count, database pool size, or write batching defaults.
- Enabling any model, OCR, RAG, vector, embedding, or training dependency.
- Claiming a new full-system capacity limit.

## Contracts

For `conversation_write`, system mixed workload summaries include available
child evidence such as:

```json
{
  "summary": {
    "clientServerGapP99Ms": 717.51,
    "serverTimingP99Ms": 83.74,
    "dbAcquireP99Ms": 0,
    "dbBatchWaitP99Ms": 49.18,
    "dbInsertP99Ms": 42.67,
    "gatewayExitCode": [null],
    "gatewaySignal": [null],
    "runtimeDiagnostics": {
      "after": {
        "gatewayCount": 1,
        "okGateways": 1,
        "unavailableGateways": 0,
        "maxCurrentConns": 276,
        "totalAcceptedConns": 276
      }
    },
    "databaseDiagnostics": {
      "after": {
        "gatewayCount": 1,
        "okGateways": 1,
        "totalEmptyAcquireCount": 1
      }
    }
  }
}
```

Missing child diagnostic fields remain omitted or `null`; older reports remain
parseable.

## Acceptance Criteria

- System mixed workload tests prove Conversation server timing, client/server
  gap, gateway process, runtime diagnostics, and database diagnostics are
  summarized.
- Sustained mixed workload tests prove the workload summary survives sample
  rollup.
- Scale-up tests prove repeated sample summaries merge into the step workload
  summary without dropping the diagnostic signal.
- Secret masking remains intact.
- Focused Node tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove the Conversation diagnostics summary fields from the system mixed,
sustained, and scale-up runner summaries. The child Conversation benchmark
reports and diagnostics endpoints remain unchanged.
