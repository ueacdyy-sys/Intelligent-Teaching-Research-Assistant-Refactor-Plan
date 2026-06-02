# SDD 0158: Identity Ingress Bearer Affinity

## Problem

SDD 0157 added a process-local deny cache for access tokens revoked by the same
Identity gateway process. P63 4400 phase evidence shows the cache only avoided
`719` of `8800` revoked-token principal lookups because the Identity ingress
proxy routes each request independently across upstream gateway workers.

The current revoke-cycle shape sends `DELETE /sessions/{sessionId}` and the
following `GET /principal` with the same bearer token. If those requests land on
different gateway workers, the local deny cache misses and the request still
falls back to the session database.

## Scope

In scope:

- Route Identity ingress requests with `Authorization: Bearer <token>` by a
  stable token hash instead of pure round-robin.
- Keep anonymous requests, password login, WeChat start/callback, and other
  tokenless requests on round-robin.
- Preserve retry behavior: if the selected upstream fails before a usable
  response, the proxy may still retry another upstream where existing retry
  rules allow it.
- Keep the session database as the durable source of truth.
- Record focused tests and performance evidence without root SLO promotion.

Out of scope:

- Distributed cache or Redis.
- Persisting token affinity outside the ingress proxy process.
- Public API contract changes.
- Promoting full-system ultra-concurrency support.

## Contracts

The ingress proxy keeps the same command-line and HTTP contract. Its upstream
selection changes internally:

- Bearer-token requests use `hash(accessToken) % upstreamCount`.
- Requests without a bearer token use existing round-robin behavior.
- No token value is logged or written to reports.

## Acceptance Criteria

- Focused ingress proxy tests prove same bearer token selects the same upstream.
- Focused ingress proxy tests prove tokenless requests still use round-robin.
- Existing ingress safe-retry tests continue to pass.
- Focused Identity and ingress tests pass.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` remain
  passable.
- Post-change Identity phase evidence shows revoke-cycle
  `getPrincipalByAccessToken` count materially below the P63 non-affinity count
  of `8081/8800`.

## Rollback

Remove the bearer-affinity picker branch and return `Director` to always calling
the round-robin picker. The process-local deny cache remains safe, but it will
again only help when later requests happen to hit the same gateway process.
