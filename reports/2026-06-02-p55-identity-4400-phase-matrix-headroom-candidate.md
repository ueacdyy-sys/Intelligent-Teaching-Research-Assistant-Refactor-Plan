# P55 Identity 4400 Phase Matrix Headroom Candidate

## Summary

The 4400-concurrency phase-aware Identity triad completed successfully with
zero workload errors in all three cases. The best measured Identity-only
candidate is `g12-p10-i16-c150`: 12 gateway workers, 10 session DB connections
per worker, 16 ingress workers, and 150 warmed client connections per ingress
target.

Decision: keep this as the next Identity tuning baseline candidate and raise
the production-candidate PgBouncer headroom profile plus the refactor-owned
Identity performance runtime from 120 to 180. Do not promote a full-system
ultra-concurrency claim from this evidence.

## Evidence

Command:

```powershell
npm run bench:identity-phase-matrix -- --out reports/identity-phase-matrix.4400-triad.json --case-prefix reports/identity-phase-matrix.4400-triad --concurrency 4400 --operations 8800 --cases "g8-p10-i16-c150:8:10:16:150:150:40:16,g10-p12-i22-c200:10:12:22:200:200:50:22,g12-p10-i16-c150:12:10:16:150:150:40:16" --timeout 2200s --startup-timeout-ms 180000
```

Reports:

- `reports/identity-phase-matrix.4400-triad.json`
- `reports/identity-phase-matrix.4400-triad.1-g8-p10-i16-c150.json`
- `reports/identity-phase-matrix.4400-triad.2-g10-p12-i22-c200.json`
- `reports/identity-phase-matrix.4400-triad.3-g12-p10-i16-c150.json`

Result:

| Case | Gateway workers | Pool per worker | Total session pool | Ingress workers | Slowest phase | Slowest P99 | Revoke P95 | Total pool acquire wait | Errors |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| g8-p10-i16-c150 | 8 | 10 | 80 | 16 | revokeCycle | 2441.97ms | 2376.26ms | 15899832.3ms | 0 |
| g10-p12-i22-c200 | 10 | 12 | 120 | 22 | revokeCycle | 2637.16ms | 2507.56ms | 21775210.08ms | 0 |
| g12-p10-i16-c150 | 12 | 10 | 120 | 16 | revokeCycle | 2377.39ms | 2329.74ms | 13726905.3ms | 0 |

The runner recommended `g12-p10-i16-c150`.

## Bottleneck Reading

All cases passed functionally, but revoke cycle remains the slowest phase. The
winning case reduced the slowest phase P99 from the P52 multi6/pool12 operation
timing baseline (`3168.97ms`) to `2377.39ms`, a meaningful Identity-only
improvement.

The bottleneck is still not PostgreSQL saturation in the normal sense. The
phase deltas continue to show gateway-side pgx pool acquire wait as the largest
accumulated queue signal. More worker fanout helps, but increasing ingress and
client fanout too aggressively (`g10-p12-i22-c200`) moves the tail in the wrong
direction.

## Configuration Decision

Do not switch the whole-system current source evidence to the new Identity
candidate yet. If the 12-worker Identity candidate is combined with the current
conversation and teaching source evidence, hot-path application pools would sum
to:

```text
identity 120 + conversation 16 + teaching 1 = 137
```

That exceeds the current cross-module PgBouncer cap of 90 and also makes the
old 120 production candidate insufficient for 20% headroom.

The safe config change for this slice is:

```text
contracts/config/pgbouncer-production-headroom.profile.json
maxDbConnections: 120 -> 180

infra/perf/identity-session-pgbouncer.ini
max_db_connections: 120 -> 180
```

At 180, the next mixed-workload proof can include the 12-worker Identity
candidate and still retain 43 PgBouncer server connections of source hot-path
headroom, above the 20% policy floor (`ceil(180 * 0.2) = 36`).

## Interpretation

Identity can now pass 4400 logical concurrency in multiple shapes and the best
shape improved the measured slowest P99. This is evidence of module-level
progress, not evidence that the whole system supports ultra-high concurrency.

The next honest proof is a mixed-workload run using the 180 PgBouncer candidate
and the `g12-p10-i16-c150` Identity shape. Only then should the current
whole-system source evidence be changed.

## Verification Plan

- `node --test tools/run-identity-phase-matrix.test.mjs`
- `node --test tools/pgbouncer-production-headroom-audit.test.mjs`
- `npm run verify:structure`
- `npm run audit:pgbouncer-production-headroom`
- `npm run audit:performance-evidence`
- `npm run quality`

## Next Step

Run a Docker-managed mixed workload scale-up against the 180 PgBouncer candidate
and the 12-worker Identity tuning shape. Keep root SLO promotion blocked until
that run proves interactive tail latency, evidence depth, and sustained step
coverage against the immutable root workflows.
