# SDD 0151: Identity Batched Token Issuance

## Problem

The latest Identity 4400-concurrency evidence still blocks root SLO promotion:
`revokeCycle.p99_ms=3071.17`, with the nested `login` step contributing the
largest step P99 at `1498.29ms`.

The password/wechat login hot path currently calls the cryptographic random
source separately for the session id, access token, and refresh token. Refresh
rotation calls it separately for the new access and refresh tokens. Under very
high concurrency this multiplies CSPRNG system-call pressure in the same paths
that already dominate the Identity tail.

## Source Requirement References

- Immutable root requirement: identity/session flows are part of the
  whole-system assistant runtime and must remain correct for teacher, student,
  research, admin, and remote entry points.
- SDD 0147: revoke-cycle attribution shows login as the slowest nested step.
- SDD 0150: current full-system audits consume the latest Identity 4400
  evidence and still block ultra-concurrency promotion on tail latency.

## Scope

In scope:

- Add optional batched token issuance hooks for user-session and refresh-token
  rotation hot paths.
- Implement the production `platform.TokenIssuer` hooks with one CSPRNG read
  per token group.
- Preserve the existing `TokenIssuer` interface and fallback path for test or
  custom issuers that only implement single-token methods.
- Keep token prefixes, entropy size, response contracts, and session security
  semantics unchanged.

Out of scope:

- Replacing cryptographic randomness with deterministic or weak randomness.
- Changing token formats or public Identity HTTP contracts.
- Changing session storage, revocation, refresh, or authorization semantics.
- Adding cache, queue, model, OCR, RAG, vector, embedding, or training
  dependencies.
- Promoting a full-system ultra-concurrency claim without fresh benchmark
  evidence.

## Contracts

- If an issuer implements `NewUserSessionTokens() (sessionID, accessToken,
  refreshToken string)`, password and wechat session creation use that method
  instead of three separate token calls.
- If an issuer implements `NewAccessRefreshTokens() (accessToken, refreshToken
  string)`, refresh rotation uses that method instead of two separate token
  calls.
- Issuers without the optional hooks continue to work through the existing
  single-token methods.
- `platform.TokenIssuer` generates the same 24 random bytes per token, but reads
  all bytes for a token group in one `crypto/rand` call.

## Acceptance Criteria

- A focused usecase test fails if password session creation still calls the
  three single-token methods when a batched user-session issuer is available.
- A focused usecase test fails if refresh rotation still calls the two
  single-token methods when a batched access/refresh issuer is available.
- A platform test proves batched production tokens keep the expected prefixes and
  are distinct.
- Existing Identity usecase tests pass.
- Go tests and strict quality remain passable.
- Full-system ultra-concurrency promotion remains blocked until fresh evidence
  proves the root gates.

## Observability And Performance Evidence

This is a hot-path micro-optimization for login and refresh. It reduces local
CSPRNG reads per password/wechat login from three to one and per refresh from
two to one. The next live Identity benchmark must be treated as the actual
performance evidence; this SDD only proves the implementation path is smaller
and behavior-preserving.

Follow-up evidence:

- `reports/identity-http-benchmark.batched-token-smoke.json` passed a 128
  concurrency live PgBouncer smoke with zero phase errors.
- `reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-batched-token-ingress19080-clean-table-docker-bench.json`
  passed the 4400-concurrency profile with zero phase errors and improved
  `revokeCycle.p99_ms` from `3071.17` to `2879.83`, but worsened
  `passwordLogin.p99_ms` from `1733.55` to `2304.21`.
- Because the phase profile is mixed and still exceeds the root interactive P99
  target, this report is decision evidence only; it must not replace the current
  Identity source evidence for root SLO promotion.

## Rollback

Remove the optional batched issuer interfaces, restore individual token calls in
`IdentityService`, remove the batched `platform.TokenIssuer` methods and focused
tests, then rerun Go tests and strict quality.
