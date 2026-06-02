# P69 System Conversation Runtime Diagnostics Rollup

## Summary

P69 extends the system mixed workload reports with a concise Conversation
runtime diagnostics summary. This is an evidence-quality improvement, not a
capacity promotion and not a behavioral optimization.

P68 showed two important facts:

- `identitySessionDbWriteConcurrency=10` is not a usable full mixed
  optimization on this Windows/Docker profile.
- The failed Conversation workload reports already contained useful child
  evidence, but the system rollup did not surface it.

The new rollup fields let future system reports show whether a Conversation
failure is closer to database queueing, server processing, gateway process
liveness, or client/socket pressure.

## SDD

- `docs/sdd/0162-system-conversation-runtime-diagnostics-rollup.md`

## Implementation

For the `conversation_write` workload, the system mixed summary now preserves:

- `serverTimingP99Ms`
- `clientServerGapP99Ms`
- `dbAcquireP99Ms`
- `dbBatchWaitP99Ms`
- `dbInsertP99Ms`
- `gatewayExitCode`
- `gatewaySignal`
- bounded `runtimeDiagnostics`
- bounded `databaseDiagnostics`

Sustained mixed workload sample summaries now retain each workload `summary`.
Sustained scale-up step summaries merge repeated workload summaries by taking
the highest observed P99-style metrics and keeping the latest available
diagnostic snapshot.

## Why This Matters

The P68 failed runs had enough child evidence to avoid the wrong fix:

| Evidence | Observation |
| --- | --- |
| `mixed4400` Conversation errors | 53 connection-refused errors |
| `mixed4400` Conversation server P99 | 83.74ms |
| `mixed4400` Conversation client/server gap P99 | 717.51ms |
| `mixed4400` `db.acquire` P99 | 0ms |
| `mixed4400` gateway exit codes | all `null` |
| `mixed4400` runtime diagnostics after run | all 16 gateways reported `OK` |

That points away from simply raising the Conversation DB pool. The next
optimization slice should keep checking local socket/load-generator pressure,
gateway listener pressure, and runtime placement before changing write
semantics or database capacity.

## Verification

```powershell
node --test tools\run-system-mixed-workload-benchmark.test.mjs tools\run-system-sustained-mixed-workload.test.mjs tools\run-system-sustained-mixed-workload-scaleup.test.mjs
npm run verify:structure
npm run quality
git diff --check
```

Results:

- focused Node tests: 27 passed, 0 failed
- structure verification: passed
- quality gate: passed
- whitespace check: passed
- Docker residual check: no `ita-identity-session` containers found

## Next Step

Use the new system-level diagnostics summary in the next full mixed run. If
Conversation still fails while gateway exit codes remain `null`, diagnostics
remain `OK`, and DB acquire P99 stays near zero, the next practical path is to
test the stable P67 shape with a WSL or Dockerized load generator before
changing service semantics.
