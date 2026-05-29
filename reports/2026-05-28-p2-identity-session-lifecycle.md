# P2 Identity Session Lifecycle Report

## Scope

Extended the executable Identity Access Gateway with session lifecycle behavior from the OpenAPI contract.

This keeps the whole-system identity boundary usable for teacher desktop, research desktop, student app, and remote command entry without requiring clients to remain on a one-shot login flow.

## Files Updated

- `docs/sdd/0007-identity-access-gateway.md`
- `services/identity-access-gateway/internal/domain/identity.go`
- `services/identity-access-gateway/internal/usecase/identity.go`
- `services/identity-access-gateway/internal/usecase/identity_test.go`
- `services/identity-access-gateway/internal/adapter/httpapi/server.go`
- `services/identity-access-gateway/internal/adapter/httpapi/server_test.go`

## Implemented Behavior

- `POST /v1/identity/sessions/refresh`
  - Accepts `refreshToken`.
  - Rotates access and refresh tokens.
  - Keeps the same `sessionId`.
  - Invalidates the old access token.
  - Invalidates the old refresh token.

- `DELETE /v1/identity/sessions/{sessionId}`
  - Requires bearer access token.
  - Allows a principal to revoke its own session.
  - Allows admin principals to revoke other sessions.
  - Invalidates both access and refresh tokens.

## Architecture Boundary

The use case still depends only on ports:

- `SessionStore`
- `TokenIssuer`
- `Clock`

The in-memory store now tracks:

- access token to principal
- refresh token to principal
- session ID to current access token
- session ID to current refresh token

This is still a refactor-time store. A durable PostgreSQL or legacy-auth adapter should implement the same port in the next slice.

## Test Evidence

New use-case tests prove:

- refresh rotates tokens and invalidates old access
- refresh invalidates old refresh token
- revoke invalidates access and refresh tokens
- revoke rejects a different non-admin session

New HTTP tests prove:

- refresh endpoint returns a rotated session response
- delete endpoint returns `204`
- revoked access token can no longer resolve a principal

## Rollback

The gateway is still additive and not routed by the legacy UI. Legacy FastAPI auth remains the rollback path.

## Next Slice

Add durable persistence or a legacy auth adapter behind the same ports:

- `PasswordAuthenticator`
- `SessionStore`

Then implement WeChat start/callback adapters from the existing legacy channel/auth services.
