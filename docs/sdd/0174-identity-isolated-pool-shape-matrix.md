# SDD 0174: Identity Isolated Pool Shape Matrix

## Problem

P82 proved that per-case Docker reset makes Identity phase matrix comparisons
less vulnerable to the P81 order effect. The remaining tuning question is not
whether `SESSION_DB_MIN_CONNS=8` can improve one narrow run, but whether a
different pool shape improves both user-visible tail latency and the measured
local pgx pool acquire pressure.

The next evidence slice needs to vary session DB max connections and min
connections together under the same isolated benchmark contract.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0170: phase matrix reports must identify pool-wait-dominated operations.
- SDD 0171: `SESSION_DB_MIN_CONNS` is explicit runtime evidence and defaults to
  `0` unless promoted by data.
- SDD 0173: fairer configuration comparisons should use per-case Docker reset.

## Scope

In scope:

- Run an isolated Identity phase matrix with `--case-isolation docker-reset`.
- Compare four pool shapes:
  - `gatewayCount=2`, `sessionDbMaxConns=8`, `sessionDbMinConns=0`
  - `gatewayCount=2`, `sessionDbMaxConns=8`, `sessionDbMinConns=8`
  - `gatewayCount=2`, `sessionDbMaxConns=12`, `sessionDbMinConns=0`
  - `gatewayCount=2`, `sessionDbMaxConns=12`, `sessionDbMinConns=8`
- Record max phase P99, total pool acquire time, dominant pool wait operation,
  and error count for every case.
- Decide whether any candidate deserves a larger follow-up run.

Out of scope:

- Promoting new production defaults from one smoke matrix.
- Changing Identity behavior, SQL semantics, session persistence semantics,
  PgBouncer limits, PostgreSQL limits, worker count, or write concurrency.
- Adding Redis, model/training/OCR/RAG/vector/embedding dependencies.

## Contracts

The matrix must keep the P82 isolated comparison contract:

```json
{
  "caseIsolation": "docker-reset",
  "benchmarkRuntime": "docker",
  "cleanup": "reset"
}
```

Each case uses the 9-field compact spec introduced by SDD 0172:

```text
name:gatewayCount:sessionDbMaxConns:sessionDbMinConns:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost
```

The recommendation contract is intentionally conservative: a candidate can
advance to a larger matrix only when it reduces both max phase P99 and total
pool acquire pressure in the isolated report.

## Acceptance Criteria

- The isolated matrix completes and records one child report per case.
- Every case reports `errors=0`, or the report clearly treats failures as the
  primary result.
- The report distinguishes latency improvement from pool acquire improvement.
- A default is not promoted unless the same candidate improves both P99 and
  pool acquire pressure.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` pass.
- Docker cleanup leaves no running Identity session benchmark containers.

## Rollback

Delete this evidence slice and keep P82 as the last accepted isolation
capability. No runtime defaults depend on this matrix.
