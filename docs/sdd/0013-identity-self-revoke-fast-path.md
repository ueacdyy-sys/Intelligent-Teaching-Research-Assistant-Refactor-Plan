# SDD 0013: Identity Self-Revoke Fast Path

## Problem

HTTP concurrency evidence shows Identity principal lookup is stable under higher concurrency, while mixed read/write paths such as revoke cycle grow more quickly. A normal user revoking their own session currently performs a principal read for authorization and then a revoke write. For the common self-revoke path, the same authorization condition can be enforced at the session-store boundary with one conditional write.

The refactor should keep the Identity use case independent from PostgreSQL while allowing durable stores to optimize this common path.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a shared identity boundary.
- SDD 0006: Identity Access owns principal context and access boundaries.
- SDD 0008: durable sessions must invalidate access and refresh tokens.
- SDD 0012: HTTP gateway benchmark identifies mixed read/write revoke cycle as the next Identity performance pressure point.

## Scope

In scope:

- Add an inner-layer optional port for self-session revoke.
- Let the use case try the optimized self-revoke path before the existing principal lookup path.
- Keep admin/different-session revoke behavior on the existing authorization path.
- Implement the optimized path in memory and PostgreSQL stores.
- Preserve expiration and revoked-session semantics.

Out of scope:

- Admin bulk session management.
- Physical deletion or compaction of revoked session rows.
- Redis/token cache introduction.
- Changing public HTTP contracts.

## Contracts

- Inner optional port: `RevokeOwnSession(ctx, accessToken, sessionID, now)`.
- Public API remains `DELETE /v1/identity/sessions/{sessionId}` with bearer authorization.
- PostgreSQL contract remains `identity_sessions`; no table rewrite is required.

## Acceptance Criteria

- Use-case tests prove self-revoke uses the fast path without first reading principal context.
- Use-case tests prove non-own revoke still falls back to the existing authorization path.
- PostgreSQL adapter tests prove matching active, unexpired access/session pairs are revoked by one conditional write.
- PostgreSQL adapter tests prove mismatched access/session pairs do not revoke.
- Root `npm test` passes.
- HTTP revoke-cycle benchmark is re-run after implementation and compared with the previous 256-concurrency result.

## Rollback

Remove the optional port and use-case branch. The existing `GetPrincipal` plus `RevokeSession` path remains the compatibility fallback.

## Observability And Performance Evidence

Evidence should record:

- Before/after HTTP revoke-cycle P95 at concurrency 256.
- Error count for the benchmark run.
- Cleanup state: no gateway listener and zero active sessions after the benchmark.
