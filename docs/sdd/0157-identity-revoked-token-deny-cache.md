# SDD 0157: Identity Revoked Token Deny Cache

## Problem

P62 mixed workload evidence shows the current `mixed5800` practical boundary is
no longer conversation write throughput. After tuning shared transport,
Identity `revokeCycle` becomes the clear guardrail risk because each synthetic
cycle still performs login, revoke, and an immediate revoked-principal lookup.

The revoke step already has a one-write self-revoke fast path. The immediate
lookup after a successful self revoke still goes back to the session database
only to learn that the just-revoked access token is invalid. Under sustained
mixed load, that redundant read adds gateway-local session DB pool queueing.

## Scope

In scope:

- Add a short-lived in-process deny cache for access tokens revoked by the same
  Identity service process.
- Check that deny cache before session-store access in `GetPrincipal`.
- Record a token only after a successful self-session revoke.
- Keep the database as the durable source of truth for session validity.
- Bound cache lifetime and size so high churn cannot grow memory without limit.
- Record focused test and benchmark evidence without promoting full-system SLO
  support.

Out of scope:

- Redis, distributed cache, queue, training, OCR, RAG, vector, embedding, or
  model dependencies.
- Public Identity API contract changes.
- Cross-worker revocation propagation.
- Root SLO promotion or an official ultra-concurrency support claim.

## Contracts

Public contracts remain unchanged:

- `GET /v1/identity/principal`
- `DELETE /v1/identity/sessions/{sessionId}`

Internal behavior:

- A successful `SelfSessionRevoker.RevokeOwnSession` records the normalized
  access token in a process-local deny cache.
- `GetPrincipal` returns `ErrInvalidSession` immediately when the normalized
  access token is present and unexpired in that deny cache.
- If the cache misses or the entry has expired, `GetPrincipal` uses the
  configured `SessionStore` exactly as before.

## Acceptance Criteria

- Use-case tests prove successful self revoke denies the same access token
  without a follow-up store lookup.
- Use-case tests prove failed different-session revoke does not deny-cache the
  caller token.
- Internal cache tests prove expired deny entries stop matching.
- Focused Identity tests pass.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` remain
  passable.
- Post-change performance evidence compares the same P62-shaped mixed workload
  or a focused Identity revoke-cycle profile before any capacity claim changes.

## Rollback

Remove the deny-cache field, helper methods, focused tests, and this SDD. The
existing session-store-backed validation path and self-revoke fast path remain
valid rollback behavior.
