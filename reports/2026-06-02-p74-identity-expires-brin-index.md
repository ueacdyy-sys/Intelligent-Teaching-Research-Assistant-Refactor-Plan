# P74 Identity Expires BRIN Index

## Context

P73 ruled out two simple Identity configuration changes for `mixed1600`:
`15 workers x pool8` and `12 workers x pool12` did not beat the same-run
`12 workers x pool10` baseline. The next narrower hypothesis was write
amplification inside the `identity_sessions` table.

The table still kept a btree `expires_at` index for inactive-session pruning.
That index is maintained by login inserts, refresh updates, and revoke deletes,
but it is not part of the hot authentication lookup path. P74 migrates this
maintenance index to BRIN to lower index write amplification while keeping
pruning support.

## SDD

- `docs/sdd/0166-identity-session-expires-brin-index.md`

## Implementation

- `services/identity-access-gateway/internal/adapter/postgres/session_store.go`
  now drops the old btree `idx_identity_sessions_expires_at` and creates
  `idx_identity_sessions_expires_at_brin` with `USING BRIN (expires_at)`.
- `contracts/sql/identity-sessions.sql` mirrors the same schema contract.
- Focused schema tests lock the migration contract.

## TDD Evidence

Red test before implementation:

```text
go test ./services/identity-access-gateway/internal/adapter/postgres -run TestEnsureSchemaUsesLowWriteAmplificationExpiresIndex -count=1 -v
```

Result: failed because the schema still created the old btree index and did
not drop it.

Green focused tests after implementation:

```text
go test ./services/identity-access-gateway/internal/adapter/postgres -run TestEnsureSchemaUsesLowWriteAmplificationExpiresIndex -count=1 -v
go test ./services/identity-access-gateway/internal/adapter/postgres -run "TestEnsureSchemaDropsRedundantActiveTokenIndexes|TestEnsureSchemaUsesLowWriteAmplificationExpiresIndex|TestSessionStorePrunesInactiveSessions|TestSessionStoreRevokeOwnSessionUsesAccessAndSessionCondition|TestSessionStoreRevokeInvalidatesTokens" -count=1 -v
go test ./services/identity-access-gateway/internal/adapter/postgres -count=1
npm run verify:structure
git diff --check
```

Result: all passed.

## Mixed1600 Probe

Command shape: same as P73 baseline rerun, with `12 workers x pool10`,
`identitySessionDbWriteConcurrency=0`, unlogged session table persistence, local
Conversation loadgen, and Docker cleanup reset.

| Run | Status | System P99 ms | Identity P99 ms | Conversation P99 ms | Teaching P99 ms | Identity password P99 ms | Identity lookup P99 ms | Identity refresh P99 ms | Identity revoke P99 ms | Revoke slowest step P99 ms | Revoke pool acquire ms | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P73 baseline rerun | PASSED | 678.38 | 678.38 | 230.26 | 540 | 621.98 | 460.49 | 373.37 | 678.38 | 365.03 | 1532842.65 | 0 |
| P74 BRIN | PASSED | 685.19 | 685.19 | 336.24 | 321 | 641.01 | 435.87 | 392.17 | 685.19 | 385.95 | 1588962.08 | 0 |

## Evidence Files

- `reports/system-sustained-mixed-workload-scaleup.p74-identity-expires-brin-mixed1600.json`

The top-level file has its per-step and child workload reports under the same
prefix.

## Interpretation

- The schema migration works and keeps public Identity behavior unchanged.
- The `mixed1600` run passed with zero errors, so the BRIN migration did not
  break the current moderate mixed profile.
- The single-sample P74 probe did not beat the P73 same-run baseline. Treat it
  as neutral to mildly positive schema hygiene, not as a proven tail-latency
  improvement.
- No capacity limit, root SLO, or ultra-concurrency claim changes are justified
  by this evidence.

## Next Action

Keep the current system performance shape unchanged. The next optimization
should not raise worker or pool limits. It should gather a more direct
operation-level SQL/write profile for the two write operations inside
`revokeCycle`: `saveSession` and `revokeOwnSession`.
