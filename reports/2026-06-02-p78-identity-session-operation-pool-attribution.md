# P78 Identity Session Operation Pool Attribution Smoke

## Context

P77 proved the Identity `principal_json` write-path change under the same
mixed1600 system profile. The remaining question was not "is the system alive",
but "where does the slow write time actually go".

P78 adds operation-level attribution for PostgreSQL-backed session writes so the
report can split each operation into:

- pool acquire time
- database execute time

This is diagnostics evidence, not a capacity promotion.

## Source Reports

- `reports/identity-http-benchmark.p78-session-operation-pool-attribution-smoke.json`
- `reports/2026-06-02-p77-principal-json-elision-mixed1600.md`

## Smoke Result

| Item | Value |
|---|---:|
| Status | PASSED |
| Gateway workers | 2 |
| Session DB max connections per worker | 8 |
| Session table persistence | unlogged |
| Concurrency | 128 |
| Operations per phase | 256 |
| Total duration | 3113.84 ms |
| Errors | 0 |

## Phase Result

| Phase | P95 ms | P99 ms | RPS | Errors |
|---|---:|---:|---:|---:|
| passwordLogin | 51.48 | 56.97 | 3380.23 | 0 |
| principalLookup | 31.19 | 33.39 | 4237.77 | 0 |
| refreshRotation | 42.68 | 43.79 | 3042.75 | 0 |
| revokeCycle | 60.89 | 64.41 | 2289.68 | 0 |

## New Bottleneck Attribution

`revokeOwnSession` in `revokeCycle` now shows the split clearly:

- average total elapsed: `24.25 ms`
- average pool acquire: `20.96 ms`
- average DB execute: `3.27 ms`

That means most of the write-side wait time is outside the SQL itself. The
current bottleneck looks like connection acquisition / queueing, not the DELETE
statement body.

`saveSession` shows the same pattern:

- average total elapsed: `19.45 ms`
- average pool acquire: `16.07 ms`
- average DB execute: `3.36 ms`

The implementation counts zero-duration measured pool acquires in
`poolAcquireCount`. This keeps the attribution denominator aligned with the
operation count when a connection is acquired immediately.

## Covered Architecture Modules

This P78 slice completed the following architecture module work:

| Module slice | Status |
|---|---|
| Identity session operation timing diagnostics | DONE |
| Identity HTTP benchmark diagnostics propagation | DONE |
| System phase summary rollup for session operation attribution | DONE |
| Matrix summary preservation for session operation attribution | DONE |

## Interpretation

- The new diagnostic fields are flowing end to end.
- The smoke passed with zero errors.
- The write bottleneck is still there, but now it is better attributed.
- This run does not justify raising worker counts, pool sizes, or claiming
  ultra-high concurrency support.

## Next Action

Use the attribution result to decide the next optimization slice for
`revokeOwnSession`: connection scheduling, pool sizing policy, or SQL/index work
if a later run shows DB execution is the bigger part.
