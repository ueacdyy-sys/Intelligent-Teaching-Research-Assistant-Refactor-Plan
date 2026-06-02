# P76 Identity Principal JSON Column Timestamp Elision

## Context

P75 rolled Identity operation diagnostics into system reports and made
`saveSession` visible in mixed workload evidence. The current session store
already treats `identity_sessions.issued_at` and `identity_sessions.expires_at`
as authoritative read columns, but `SaveSession` still wrote the same timestamp
fields into `principal_json`.

P76 removes that duplicated JSON payload from new session inserts. This is a
narrow write-path optimization, not a configuration change and not a capacity
promotion.

## SDD

- `docs/sdd/0168-identity-principal-json-column-timestamp-elision.md`

## Red Test

Before implementation:

```text
go test ./services/identity-access-gateway/internal/adapter/postgres -run TestSessionStoreSaveSessionOmitsColumnBackedTimestampsFromPrincipalJSON -count=1 -v
```

Result: failed because stored `principal_json` still included `IssuedAt` and
`ExpiresAt`.

## Implementation

- `encodePrincipal` now marshals a storage-only principal shape without
  `IssuedAt` and `ExpiresAt`.
- Session reads still decode `principal_json` and then restore timestamps from
  `issued_at` and `expires_at`.
- The fake PostgreSQL test double now models the real table columns by storing
  timestamps from insert arguments instead of decoding them from JSON.

## Focused Verification

```text
go test ./services/identity-access-gateway/internal/adapter/postgres -run "TestSessionStoreSaveSessionOmitsColumnBackedTimestampsFromPrincipalJSON|TestSessionStoreSavesAndLoadsByAccessToken|TestSessionStoreRotatesTokensAndInvalidatesOldTokens|TestSessionStoreRotateRefreshSessionReturnsUpdatedPrincipal" -count=1 -v
go test ./services/identity-access-gateway/internal/adapter/postgres -count=1
go test ./services/identity-access-gateway/... -count=1
npm run verify:structure
```

Result: all passed.

## HTTP Smoke

Source report:

- `reports/identity-http-benchmark.p76-principal-json-timestamp-elision-smoke.json`

Profile:

- 2 Identity gateway workers
- 12 session DB connections per gateway
- `identity_sessions` as `UNLOGGED`
- 128 logical concurrency
- 256 operations per phase
- local Go load generator
- PgBouncer diagnostics enabled

| Phase | P95 ms | P99 ms | RPS | Errors |
|---|---:|---:|---:|---:|
| `passwordLogin` | 101.12 | 102.77 | 1704.56 | 0 |
| `principalLookup` | 59.28 | 62.56 | 2412.85 | 0 |
| `refreshRotation` | 61.30 | 67.12 | 2099.06 | 0 |
| `revokeCycle` | 87.91 | 91.00 | 1943.80 | 0 |

Operation diagnostics from the smoke:

| Phase | Operation | Count | Average elapsed ms |
|---|---|---:|---:|
| `passwordLogin` | `saveSession` | 256 | 58.74 |
| `principalLookup` | `getPrincipalByAccessToken` | 256 | 38.55 |
| `refreshRotation` | `rotateRefreshSession` | 256 | 45.97 |
| `revokeCycle` | `saveSession` | 256 | 26.52 |
| `revokeCycle` | `revokeOwnSession` | 256 | 31.14 |

## Interpretation

- The change reduces per-session JSON encoding and JSONB write payload by
  removing two duplicated timestamp fields from new `principal_json` values.
- The short HTTP smoke passed with zero errors, so the Identity runtime still
  works with column-backed timestamps.
- This evidence is intentionally narrow. It does not prove higher mixed-system
  capacity and does not change any root SLO or ultra-concurrency claim.
- The next performance work should continue from P75/P76 evidence and compare
  the write-path change under the existing `mixed1600` system profile before
  changing worker, pool, or PgBouncer defaults.

## Cleanup

The P76 Identity Docker performance stack was stopped after the smoke. No
`identity-session` containers remained after cleanup.
