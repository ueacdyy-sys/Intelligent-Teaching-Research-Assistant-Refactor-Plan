# SDD 0090: Identity Refresh Rotation Fast Path

## Problem

The current multi-ingress Identity HTTP evidence shows that the entry tier can
hold a much higher steady-state concurrency after worker fan-out and connection
reuse. At the current 2600-concurrency pass point, the next visible risk is
write-path tail latency:

- `refreshRotation.p95_ms = 1449.84`
- `revokeCycle.p95_ms = 1248.05`

`RefreshSession` currently performs a refresh-token principal lookup and then a
separate token rotation write. That creates two database round trips for the
common refresh path. The durable PostgreSQL store can enforce the same active
and unexpired refresh-token condition with one conditional update that returns
the updated principal.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a shared,
  stable identity boundary.
- SDD 0006: Identity Access owns principal context and access boundaries.
- SDD 0008: durable sessions must invalidate old access and refresh tokens.
- SDD 0012: HTTP gateway benchmarks provide the client-facing Identity
  performance evidence.
- SDD 0089: the current multi-ingress pass point is 2600 concurrency; refresh
  rotation is the heaviest successful phase by P95 latency.

## Scope

In scope:

- Add an inner-layer optional port for atomic refresh-token rotation.
- Let the use case try the optimized refresh path before the existing
  lookup-then-update fallback.
- Implement the optimized path in the PostgreSQL session store.
- Preserve old-token invalidation, expiration checks, and principal projection.
- Keep public HTTP contracts unchanged.
- Re-run focused tests and live HTTP evidence after implementation.

Out of scope:

- Changing token TTLs.
- Changing the public refresh endpoint shape.
- Introducing Redis, external caches, model dependencies, OCR, RAG, vector
  databases, embeddings, or training dependencies.
- Replacing the multi-ingress 2600/2800 boundary evidence. This slice adds a
  write-path optimization and fresh comparison evidence.

## Contracts

- Optional inner port:
  `RotateRefreshSession(ctx, refreshToken, newAccessToken, newRefreshToken, issuedAt, expiresAt)`
- Existing public API remains:
  `POST /v1/identity/sessions/refresh`
- PostgreSQL table remains:
  `identity_sessions`
- Focused tests:
  - `go test ./services/identity-access-gateway/internal/usecase -run TestRefreshSessionUsesOptimizedRefreshRotation -count=1 -v`
  - `go test ./services/identity-access-gateway/internal/adapter/postgres -run TestSessionStoreRotateRefreshSessionReturnsUpdatedPrincipal -count=1 -v`

## Acceptance Criteria

- Use-case tests fail before the optional refresh-rotation port exists.
- PostgreSQL adapter tests fail before the single-statement refresh rotation
  method exists.
- When the store implements the optional port, `RefreshSession` does not call
  `GetPrincipalByRefreshToken` before rotation.
- The optimized store method invalidates the old access and refresh token,
  returns the updated principal, and refuses missing, revoked, or expired
  refresh tokens.
- Fallback store behavior remains unchanged for stores that do not implement
  the optional port.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0090, the optional refresh-rotation port, use-case fast-path branch,
PostgreSQL `RotateRefreshSession` implementation, tests, and any new evidence
registered for this slice. The existing lookup-then-rotate path remains the
compatibility fallback.

## Observability And Performance Evidence

Record:

- Red focused use-case and PostgreSQL adapter tests before implementation.
- Focused test results after implementation.
- Live Identity HTTP benchmark comparison for the optimized refresh path.
- Performance evidence registry audit result if new live reports are
  registered.
- `npm test` and `npm run quality` results.
- Docker shutdown and Rust target cleanup.
