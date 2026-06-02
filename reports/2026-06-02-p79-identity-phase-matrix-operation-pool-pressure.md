# P79 Identity Phase Matrix Operation Pool Pressure

## Context

P78 made Identity session write operations report pool acquire time and DB
execute time. P79 turns those raw fields into phase-matrix tuning signals so a
matrix report can say which phase and operation are most controlled by
gateway-local pool waiting.

This is reporting and decision support only. It does not change Identity
runtime defaults, session semantics, SQL, worker counts, PgBouncer limits, or
PostgreSQL limits.

## SDD

- `docs/sdd/0170-identity-phase-matrix-operation-pool-pressure.md`

## Implementation

Identity phase matrix summaries now derive:

- `poolAcquireShare`
- `dbExecuteShare`
- `slowestSessionOperation`
- `highestPoolAcquireShareOperation`
- `dominantPoolWaitPhase`
- `dominantPoolWaitOperation`
- `dominantPoolAcquireShare`

Older child reports without P78 pool-attribution fields remain parseable and
do not produce a false pool-wait conclusion.

## Focused Tests

```powershell
node --test tools\run-identity-phase-matrix.test.mjs
npm run verify:structure
```

Result: passed.

## Smoke Evidence

Command:

```powershell
npm run bench:identity-phase-matrix -- --out reports/identity-phase-matrix.p79-operation-pool-pressure-smoke.json --case-prefix reports/identity-phase-matrix.p79-operation-pool-pressure-smoke --profile IDENTITY_PHASE_MATRIX_P79_OPERATION_POOL_PRESSURE_SMOKE --manage-docker true --docker-cleanup reset --stop-on-failure true --concurrency 128 --operations 256 --cases "g2-p8-i2-c64:2:8:2:64:32:32:16" --timeout 240s --startup-timeout-ms 180000
```

Result:

| Field | Value |
|---|---:|
| Status | PASSED |
| Recommended case | g2-p8-i2-c64 |
| Concurrency | 128 |
| Operations per phase | 256 |
| Max phase P99 | 107.29 ms |
| Errors | 0 |

Derived pool-pressure signal:

| Signal | Value |
|---|---|
| Dominant pool-wait phase | revokeCycle |
| Dominant pool-wait operation | revokeOwnSession |
| Dominant pool acquire share | 0.85 |

`revokeCycle.revokeOwnSession`:

| Metric | Value |
|---|---:|
| Average elapsed | 27.48 ms |
| Average pool acquire | 23.37 ms |
| Pool acquire share | 0.85 |
| Average DB execute | 4.09 ms |
| DB execute share | 0.15 |

`passwordLogin.saveSession` also shows meaningful pool waiting:

| Metric | Value |
|---|---:|
| Average elapsed | 45.53 ms |
| Average pool acquire | 36.82 ms |
| Pool acquire share | 0.81 |
| Average DB execute | 8.70 ms |
| DB execute share | 0.19 |

## Interpretation

- P79 confirms that the matrix layer can now identify pool-wait-dominated
  operations automatically.
- The smoke keeps the P78 conclusion: current narrow Identity write pressure is
  mostly gateway-local pool acquire wait, not SQL execution.
- This does not prove a higher concurrency limit and does not justify changing
  defaults by itself.
- The next tuning run can compare candidate worker/pool/ingress shapes using
  `dominantPoolAcquireShare` instead of reading raw child JSON by hand.

## Cleanup

The runner used `--docker-cleanup reset`. Post-run inspection found no current
`identity-session` containers remaining; only older exited `ita-*` containers
from prior work were still present.
