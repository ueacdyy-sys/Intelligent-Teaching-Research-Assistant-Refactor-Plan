# SDD 0152: Identity Session Operation Timing Diagnostics

## Problem

SDD 0151 reduced token issuance work in the Identity login and refresh paths,
but the follow-up 4400-concurrency evidence was mixed: revoke-cycle login
improved while standalone password login and principal lookup regressed.

The current `/internal/identity/session-db-pool` diagnostics expose pool acquire
pressure and write-limiter queueing, but they do not show service-side elapsed
time for individual session store operations. That leaves the next performance
slice guessing whether the tail comes from `saveSession`,
`getPrincipalByAccessToken`, refresh rotation, revoke, cleanup, or remote
command nonce writes.

## Source Requirement References

- Immutable root requirement: identity, teacher/student entry points, remote
  commands, and desktop assistant control remain part of the whole-system
  runtime.
- SDD 0147: revoke-cycle attribution narrowed the phase-level blocker, but not
  the database operation responsible for each step.
- SDD 0150: current root promotion remains blocked by Identity P99 latency.
- SDD 0151: batched token issuance moved the bottleneck, so the next slice needs
  operation-level service-side timing before more runtime tuning.

## Scope

In scope:

- Track service-side elapsed time for Identity session store database
  operations.
- Expose the timing counters through the existing internal session DB
  diagnostics endpoint.
- Keep operation names stable for benchmark report inspection:
  `saveSession`, `getPrincipalByAccessToken`, `getPrincipalByRefreshToken`,
  `rotateSession`, `rotateRefreshSession`, `revokeSession`,
  `revokeOwnSession`, `pruneInactiveSessions`, and `acceptRemoteCommand`.
- Preserve public Identity HTTP contracts and session semantics.

Out of scope:

- Changing authentication, refresh, revoke, or remote command behavior.
- Replacing PostgreSQL, PgBouncer, ingress, or load-generator configuration.
- Adding model training, OCR, RAG, vector, embedding, cache, queue, or other
  heavy dependencies.
- Claiming ultra-high concurrency support without a new benchmark run that uses
  the new diagnostics.

## Contracts

- `platform.SessionDBPoolStats` gains an optional `sessionOperations` object.
- Each operation stat reports `count`, `totalElapsedMs`,
  `averageElapsedMs`, and `maxElapsedMs`.
- The internal diagnostics endpoint remains protected by
  `X-Internal-Diagnostics-Secret` and must not echo the local secret.
- Operation timing records elapsed time around the database call itself,
  including `QueryRow(...).Scan(...)` for read and returning-update paths.

## Acceptance Criteria

- A focused session store test fails if read and write database operations are
  not attributed to the expected operation names.
- A focused diagnostics-provider test fails if session operation timings are not
  merged into `SessionDBPoolStats`.
- The HTTP diagnostics test fails if `sessionOperations` is missing or if the
  diagnostics response leaks `ueacd`.
- Existing Identity session store and HTTP API tests pass.
- `npm run verify:structure`, `git diff --check`, and strict quality remain
  passable.

## Observability And Performance Evidence

This slice is instrumentation, not a capacity promotion. Its value is that the
next high-concurrency Identity run can identify whether the residual tail sits
in session writes, principal reads, refresh rotation, revoke, cleanup, pool
acquire pressure, write-limiter queueing, or outside the service.

The follow-up benchmark should preserve the current 4400-concurrency PgBouncer
120 profile and compare `gatewayDatabaseDiagnostics.after.stats.sessionOperations`
across phases before changing more worker, pool, or ingress settings.

## Rollback

Remove the `sessionOperations` diagnostic field, the operation timing provider,
the session store timing counters, and the focused tests. Existing public API and
historical benchmark reports remain compatible because the field is internal and
additive.
