# P2 Identity Remote Command Replay Guard

## Decision

Remote social command grants now enforce request freshness and nonce replay protection before minting a grant.

The slice keeps the architecture boundary clean:

- Use case owns the `RemoteCommandReplayGuard` port.
- Use case enforces the `issuedAt` freshness window.
- In-memory replay guard covers local smoke tests and no-database runtime.
- PostgreSQL session store implements the same port with a durable uniqueness key for multi-worker runtime.
- HTTP and OpenAPI request/response shape remains unchanged.

## Root Requirement Link

The root requirements say users can command the desktop assistant from social/mobile platforms, and that those commands can eventually control desktop applications through the agent system. That makes replay protection part of the identity boundary, not an optional hardening task.

## Implemented Contract

- `POST /v1/identity/remote-command-grants`
  - accepts a fresh signed channel request once.
  - rejects replayed `(provider, externalSubjectId, nonce)` as `401`.
  - rejects stale `issuedAt` as `422`.
  - rejects future-skewed `issuedAt` as `422`.
- PostgreSQL schema now includes `identity_remote_command_nonces`.

Freshness constants:

- max age: `2m`
- future clock skew: `30s`
- nonce retention through grant TTL: `10m`

## TDD Evidence

The new tests failed against the old implementation:

- use case replay nonce returned `<nil>` instead of `ErrInvalidCredentials`.
- stale and future-skewed `issuedAt` still created grants.
- HTTP replay/stale/future requests returned `201`.
- PostgreSQL adapter did not yet implement `AcceptRemoteCommand`.

## Verification

Targeted verification:

```powershell
go test ./services/identity-access-gateway/internal/usecase ./services/identity-access-gateway/internal/adapter/httpapi ./services/identity-access-gateway/internal/adapter/postgres ./services/identity-access-gateway/cmd/gateway
```

Result:

- use case tests passed.
- HTTP adapter tests passed.
- PostgreSQL adapter tests passed.
- gateway composition compiled.

Full gates:

- `npm test` passed.
- `npm run quality` passed.
- Latest quality report: `reports/quality-gate.current.json`
- Quality report status: `allPassed=true`
- Quality elapsed: `137072ms`

Race check:

- `go test -race ./services/identity-access-gateway/internal/usecase ./services/identity-access-gateway/internal/adapter/httpapi` could not run in this Windows environment because `-race` requires CGO and `gcc` is not installed in `PATH`.

## Rollback

Keep the endpoint contract and remove replay guard wiring from the composition root. Password, WeChat, refresh, revoke, and principal lookup flows are unaffected.

## Next Evidence

Add a mixed HTTP benchmark that includes remote command grants after the next performance slice, so the extra durable nonce insert is measured under PgBouncer and multi-worker traffic.
