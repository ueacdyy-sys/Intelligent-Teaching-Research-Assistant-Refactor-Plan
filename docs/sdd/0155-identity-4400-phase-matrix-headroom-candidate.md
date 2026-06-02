# SDD 0155: Identity 4400 Phase Matrix Headroom Candidate

## Problem

P54 made the Identity phase-aware matrix repeatable. The follow-up 4400
concurrency triad shows that more gateway fanout can reduce the slowest
Identity tail, but the best Identity-only shape has a larger application-side
session pool footprint than the currently consumed whole-system source
evidence.

Promoting that Identity-only result directly into the whole-system capacity
claim would be unsafe: the current cross-module diagnostics still use a
PgBouncer cap of 90 server connections, while the next Identity candidate alone
uses 120 session DB connections across gateway workers.

## Source Requirement References

- Immutable root requirement: Identity and remote entry points are part of the
  whole-system assistant runtime, not an isolated service claim.
- SDD 0144: root SLO promotion review blocks full-system ultra-concurrency
  claims until runtime SLO evidence is complete.
- SDD 0148: the refactor-owned Identity performance runtime already applies a
  120-connection PgBouncer headroom profile.
- SDD 0154: the phase-aware matrix runner compares worker, pool, ingress, and
  transport fanout with phase-scoped diagnostics.

## Scope

In scope:

- Record the 4400 triad matrix as current performance evidence.
- Keep `g12-p10-i16-c150` as the next Identity tuning baseline candidate.
- Raise the production-candidate PgBouncer headroom profile and the
  refactor-owned Identity performance runtime to 180 so the next mixed workload
  proof can include the 12-worker Identity shape plus the existing conversation
  and teaching hot-path evidence while retaining 20% headroom.
- Preserve the full-system promotion block.

Out of scope:

- Promoting full-system ultra-concurrency from module-only Identity evidence.
- Changing public Identity HTTP, auth, refresh, or revoke contracts.
- Replacing the current whole-system source evidence before a mixed workload
  rerun consumes the larger PgBouncer candidate.
- Adding model training, OCR, RAG, vector, embedding, cache, queue, or other
  heavy baseline dependencies.

## Contracts

- `reports/identity-phase-matrix.4400-triad.json` remains the machine-readable
  rollup for the 4400 triad.
- `reports/identity-phase-matrix.4400-triad.3-g12-p10-i16-c150.json` remains
  the recommended Identity candidate child report.
- `contracts/config/pgbouncer-production-headroom.profile.json` uses
  `profileId=pgbouncer-production-headroom-180` and `maxDbConnections=180`.
- `infra/perf/identity-session-pgbouncer.ini` uses
  `max_db_connections = 180`.
- Root SLO promotion remains blocked unless later mixed-workload evidence and
  runtime SLO review explicitly approve it.

## Evidence

The triad command used Docker-managed PostgreSQL/PgBouncer and Docker Go load
generation:

```powershell
npm run bench:identity-phase-matrix -- --out reports/identity-phase-matrix.4400-triad.json --case-prefix reports/identity-phase-matrix.4400-triad --concurrency 4400 --operations 8800 --cases "g8-p10-i16-c150:8:10:16:150:150:40:16,g10-p12-i22-c200:10:12:22:200:200:50:22,g12-p10-i16-c150:12:10:16:150:150:40:16" --timeout 2200s --startup-timeout-ms 180000
```

| Case | Gateway workers | Pool per worker | Total session pool | Ingress workers | Slowest phase | Slowest P99 | Total pool acquire wait | Errors |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| g8-p10-i16-c150 | 8 | 10 | 80 | 16 | revokeCycle | 2441.97ms | 15899832.3ms | 0 |
| g10-p12-i22-c200 | 10 | 12 | 120 | 22 | revokeCycle | 2637.16ms | 21775210.08ms | 0 |
| g12-p10-i16-c150 | 12 | 10 | 120 | 16 | revokeCycle | 2377.39ms | 13726905.3ms | 0 |

The runner recommended `g12-p10-i16-c150` because it had the lowest slowest
phase P99 among passing cases and the lowest total pool acquire duration.

## Decision

Keep `g12-p10-i16-c150` as the next Identity tuning baseline candidate, but do
not promote it as the whole-system current source evidence yet.

Raise `contracts/config/pgbouncer-production-headroom.profile.json` to
`maxDbConnections=180`, and set
`infra/perf/identity-session-pgbouncer.ini` to `max_db_connections = 180`.
With the existing current hot path, that yields 91 connections of
source-evidence headroom. If the next mixed workload consumes the new Identity
candidate, the hot-path sum is 137 connections
(`identity=120 + conversation=16 + teaching=1`), leaving 43 connections of
headroom, which exceeds the 20% policy floor for a 180-connection cap.

## Acceptance Criteria

- Performance registry auditing requires the triad rollup and recommended child
  report.
- PgBouncer production headroom audit expects the 180-connection candidate.
- Identity session runtime profile audit expects the 180-connection PgBouncer
  performance runtime.
- Root SLO promotion remains blocked until mixed workload evidence, root
  workflow runtime SLO coverage, and module evidence depth improve.
- Strict quality passes.

## Rollback

Restore the PgBouncer production headroom profile to 120 and remove the triad
matrix reports from required performance evidence, then rerun the performance
registry, PgBouncer headroom, root SLO, system capacity, and quality gates.
