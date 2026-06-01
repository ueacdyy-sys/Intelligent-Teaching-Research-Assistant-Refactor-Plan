# P53 Identity Phase Gateway DB Diagnostics

## Summary

This slice upgrades the Identity HTTP benchmark diagnostics from whole-run
before/after snapshots to per-phase gateway database snapshots and deltas.

The intent is to make the next high-concurrency Identity matrix useful: we need
to see which measured phase is creating gateway-local pgx pool pressure instead
of mixing seed, cleanup, and measured workload effects into one aggregate.

Decision: keep the diagnostic plumbing and the SDD 0153 contract. This is not a
capacity promotion. The current system still needs phase-aware 4400-concurrency
matrix evidence before any ultra-concurrency claim can be made.

## Code Changes

- Added `docs/sdd/0153-identity-phase-gateway-db-diagnostics.md`.
- Added optional Go benchmark flags:
  - `-gateway-diagnostics-base-url`
  - `-gateway-diagnostics-secret`
- Added `gatewayDatabasePhaseDiagnostics` to Identity HTTP benchmark reports.
- Captured before/after gateway DB diagnostics around these measured phases:
  - `passwordLogin`
  - `principalLookup`
  - `refreshRotation`
  - `revokeCycle`
- Added phase delta summaries for:
  - pgx pool acquire count and acquire wait time
  - empty acquire wait time
  - canceled acquire count and wait time
  - session operation count, total elapsed time, and average elapsed time
- Wired the Node benchmark runner to pass gateway diagnostics URLs separately
  from ingress benchmark target URLs.
- For Docker load generation, rewrote gateway diagnostics targets through
  `host.docker.internal` so the container can reach local gateway workers.
- Split diagnostics helpers into smaller files to satisfy the strict source file
  size gate.

## Evidence

Smoke report:

`reports/identity-http-benchmark.phase-diagnostics-smoke.json`

Smoke command:

```powershell
npm run perf:identity-session:up
node tools/run-identity-http-benchmark.mjs --out reports/identity-http-benchmark.phase-diagnostics-smoke.json --concurrency 32 --operations 64 --session-db-max-conns 8 --session-db-session-table-persistence unlogged --gateway-count 2 --max-conns-per-host 32 --warm-connections-per-host 16 --benchmark-runtime docker --pgbouncer-diagnostics true --timeout 120s
npm run perf:identity-session:down
```

Observed phase diagnostics:

- Report contains `passwordLogin`, `principalLookup`, `refreshRotation`, and
  `revokeCycle` entries under `gatewayDatabasePhaseDiagnostics`.
- `passwordLogin.delta.sessionOperations.saveSession.count = 64`.
- `passwordLogin.delta.pool.acquireCount = 64`.
- `refreshRotation.delta.sessionOperations.rotateRefreshSession.count = 64`.
- `revokeCycle.delta.sessionOperations.saveSession.count = 64`.
- `revokeCycle.delta.sessionOperations.revokeOwnSession.count = 64`.
- `revokeCycle.delta.sessionOperations.getPrincipalByAccessToken.count = 64`.

Smoke revoke-cycle operation timing:

| Operation | Count | Total elapsed | Average elapsed |
| --- | ---: | ---: | ---: |
| getPrincipalByAccessToken | 64 | 719.28ms | 11.24ms |
| revokeOwnSession | 64 | 1064.01ms | 16.63ms |
| saveSession | 64 | 839.82ms | 13.12ms |

## Verification

Commands run:

```powershell
go test ./services/identity-access-gateway/cmd/httpbench
node --test tools/run-identity-http-benchmark.test.mjs
go test ./services/identity-access-gateway/...
npm run verify:structure
git diff --check
npm run quality
docker ps -a --filter name=ita-identity-session --format "{{.Names}} {{.Status}}"
```

Results:

- `go test ./services/identity-access-gateway/cmd/httpbench`: PASS.
- `node --test tools/run-identity-http-benchmark.test.mjs`: PASS.
- `npm run quality`: PASS.
- `git diff --check`: PASS with Windows LF/CRLF warnings only.
- Docker cleanup check: no `ita-identity-session` containers remained.

## Interpretation

The new evidence proves the benchmark can now isolate gateway DB pressure per
measured phase. It does not prove that the current system supports
ultra-high-concurrency production load.

The next useful performance run is a phase-aware 4400-concurrency matrix around
worker count, per-worker DB pool size, ingress fanout, and client connection
fanout. P52 already showed the likely bottleneck is gateway-local queueing and
process scheduling pressure, not PostgreSQL saturation. P53 gives the next run
the phase granularity needed to stop treating the whole workload as one blob.

## Next Step

Run a compact phase-aware matrix around:

- gateway workers: 8, 10, 12
- per-worker session DB pool: 10, 12, 14
- ingress workers: 16, 22
- client connections per ingress target: 150, 200

Do not promote a new capacity claim unless the root SLO promotion evidence and
mixed-workload guardrails pass together.
