# P54 Identity Phase-Aware Matrix Runner

## Summary

This slice adds a repeatable Identity phase-aware matrix runner. It turns the
P53 follow-up from hand-built benchmark commands into a small orchestration
tool that can compare gateway workers, per-worker session DB pool size, ingress
fanout, and client connection fanout while preserving phase-level database
diagnostics.

Decision: keep SDD 0154 and the runner. The smoke result is useful as a sanity
signal, but it is not an ultra-concurrency capacity claim.

## Code Changes

- Added `docs/sdd/0154-identity-phase-aware-matrix-runner.md`.
- Added `tools/run-identity-phase-matrix.mjs`.
- Added `tools/run-identity-phase-matrix.test.mjs`.
- Added `npm run bench:identity-phase-matrix`.
- Added structure verification entries for the new SDD, runner, and tests.
- Fixed the runner's Windows command execution path to invoke `npm` through
  `cmd.exe`, matching the existing system ladder runner pattern.
- Recorded child case summaries from normal Identity HTTP benchmark reports,
  including:
  - phase errors;
  - phase P95/P99;
  - phase pgx pool acquire count and duration;
  - phase empty acquire wait;
  - phase session operation timing deltas.

## Evidence

Focused tests:

```powershell
node --test tools/run-identity-phase-matrix.test.mjs
npm run verify:structure
```

Live smoke:

```powershell
npm run bench:identity-phase-matrix -- --out reports/identity-phase-matrix.smoke.json --case-prefix reports/identity-phase-matrix.smoke --concurrency 32 --operations 64 --cases "g2-p8-i2-c32:2:8:2:32:16:32:16,g3-p8-i2-c32:3:8:2:32:16:32:16" --timeout 120s --startup-timeout-ms 120000
```

Smoke reports:

- `reports/identity-phase-matrix.smoke.json`
- `reports/identity-phase-matrix.smoke.1-g2-p8-i2-c32.json`
- `reports/identity-phase-matrix.smoke.2-g3-p8-i2-c32.json`

Smoke result:

| Case | Gateway workers | Session pool per worker | Ingress workers | Slowest phase | Slowest P99 | Total pool acquire duration | Errors |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| g2-p8-i2-c32 | 2 | 8 | 2 | revokeCycle | 48.98ms | 1965.92ms | 0 |
| g3-p8-i2-c32 | 3 | 8 | 2 | revokeCycle | 36.8ms | 364.21ms | 0 |

The runner recommended `g3-p8-i2-c32` for this tiny smoke because it had the
lower slowest-phase P99 and much lower accumulated pool acquire duration.

## Interpretation

The smoke confirms the orchestration and reporting path works against real
Docker-backed PostgreSQL/PgBouncer, local gateway workers, ingress workers, and
Docker Go load generation.

The low-concurrency signal is consistent with the P52/P53 diagnosis: distributing
work over more gateway processes can reduce local pgx pool queueing. However,
this smoke is intentionally too small to justify changing production defaults or
promoting any capacity claim.

## Verification

- `node --test tools/run-identity-phase-matrix.test.mjs`: PASS.
- `npm run verify:structure`: PASS before live smoke.
- Live matrix smoke: PASS.
- Docker cleanup check: no `ita-identity-session` containers remained after the
  smoke.

## Next Step

Run the compact high-concurrency matrix proposed by P53:

- gateway workers: 8, 10, 12;
- per-worker session DB pool: 10, 12, 14;
- ingress workers: 16, 22;
- client connections per ingress target: 150, 200.

Only consider changing default runtime profiles after the larger phase-aware
matrix shows a repeatable reduction in Identity tail latency without moving the
tail into another measured phase.
