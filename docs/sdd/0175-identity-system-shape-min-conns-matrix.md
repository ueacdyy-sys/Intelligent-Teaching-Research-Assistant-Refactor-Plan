# SDD 0175: Identity System-Shape Min Connections Matrix

## Problem

P83 showed that `sessionDbMaxConns=12` with `sessionDbMinConns=8` improved both
tail latency and local pgx pool acquire pressure in a narrow 2-gateway isolated
matrix. That is useful but not enough to change runtime defaults, because the
current high-concurrency Identity candidate is a 12-gateway, 16-ingress shape
from the 4400 phase matrix.

The next step is to test whether the min-connection candidate still helps when
the matrix uses the current system-shaped Identity fanout.

## Source Requirement References

- Root requirements: Identity remains the shared access boundary for teacher,
  student, remote command, teaching archive, research conversation, knowledge,
  and Agent Harness flows.
- SDD 0155: `g12-p10-i16-c150` is the current Identity 4400 tuning baseline
  candidate, while full-system ultra-concurrency promotion remains blocked.
- SDD 0173: case comparisons that influence tuning decisions should use
  per-case Docker reset.
- SDD 0174: a min-connection candidate may advance only when it improves both
  max phase P99 and pool acquire pressure.

## Scope

In scope:

- Run a Docker-isolated 4400 Identity phase matrix with 12 gateway workers and
  16 ingress workers.
- Compare current baseline max/min pool shape against `minConns=8` and
  `maxConns=12` variants:
  - `g12-p10-min0-i16-c150`
  - `g12-p10-min8-i16-c150`
  - `g12-p12-min0-i16-c150`
  - `g12-p12-min8-i16-c150`
- Record max phase P99, phase-level P99, total pool acquire time, dominant pool
  wait operation, and error count for every case.
- Decide whether a runtime default/config change is justified.

Out of scope:

- Promoting full-system ultra-concurrency support from Identity-only evidence.
- Changing public Identity HTTP, auth, refresh, revoke, student app, or remote
  command contracts.
- Increasing PgBouncer/PostgreSQL caps, gateway worker counts, write
  concurrency, or introducing Redis/queue/cache/model/training/OCR/RAG/vector
  dependencies.

## Contracts

The matrix uses the same high-concurrency Identity fanout as the P55 baseline
candidate:

```json
{
  "concurrency": 4400,
  "operationsPerPhase": 8800,
  "gatewayCount": 12,
  "ingressCount": 16,
  "clientMaxConnsPerHost": 150,
  "clientWarmConnectionsPerHost": 150,
  "ingressMaxConnsPerHost": 40,
  "ingressWarmConnectionsPerHost": 16,
  "caseIsolation": "docker-reset"
}
```

A default/config change is allowed only if an isolated case beats the current
`g12-p10-min0-i16-c150` baseline on both:

- max phase P99
- total pool acquire pressure

The report must still classify any result as Identity-only evidence, not a
whole-system capacity promotion.

## Acceptance Criteria

- The matrix completes with one child report per case, or the report treats any
  failure as the primary result.
- The report compares against the current `g12-p10-min0-i16-c150` baseline.
- The recommendation distinguishes latency improvements from pool-wait
  improvements.
- No runtime default is changed unless the isolated data supports it.
- Focused tests, `npm run verify:structure`, `npm run quality`, `git diff
  --check`, generated evidence secret scan, and Docker residual container check
  pass before commit.

## Rollback

Delete this evidence slice and keep P83 as the latest min-connection candidate
probe. No production defaults depend on this SDD until a later change explicitly
modifies runtime configuration.
