# P2 Identity Access Gateway Report

## Scope

Implemented the first executable Go slice for the whole-system Identity And Access module:

`services/identity-access-gateway`

This slice turns the identity contract into a runnable gateway while keeping legacy auth as the rollback path.

## Files Added

- `docs/sdd/0007-identity-access-gateway.md`
- `services/identity-access-gateway/go.mod`
- `services/identity-access-gateway/cmd/gateway/main.go`
- `services/identity-access-gateway/internal/domain/identity.go`
- `services/identity-access-gateway/internal/usecase/identity.go`
- `services/identity-access-gateway/internal/usecase/identity_test.go`
- `services/identity-access-gateway/internal/adapter/httpapi/server.go`
- `services/identity-access-gateway/internal/adapter/httpapi/server_test.go`
- `services/identity-access-gateway/internal/adapter/bootstrap/authenticator.go`
- `services/identity-access-gateway/internal/platform/runtime.go`

## Files Updated

- `go.work`
- `package.json`
- `tools/verify-structure.mjs`
- `README.md`

## Implemented Behavior

- `POST /v1/identity/sessions/password`
  - Creates teacher, student, or admin password sessions.
  - Returns a contract-shaped `PrincipalContext`.

- `GET /v1/identity/principal`
  - Resolves the current principal from a bearer access token.

- `POST /v1/identity/remote-command-grants`
  - Requires `X-Channel-Signature`.
  - Returns a remote channel principal with `AGENT_COMMAND_SUBMIT`.
  - Excludes `DEVICE_LOCAL_CONTROL`.
  - Requires Harness approval.

## Architecture Boundary

Inner use cases depend on ports:

- `PasswordAuthenticator`
- `SessionStore`
- `TokenIssuer`
- `Clock`

HTTP, token generation, and bootstrap credential handling stay in adapters/platform code.

The bootstrap authenticator is intentionally temporary. It uses local `ueacd` defaults so the gateway can run during refactor, but the next slice should adapt the legacy auth source or a real Go auth store behind the `PasswordAuthenticator` port.

## Test Evidence

Command:

```powershell
npm run test:go
```

Result:

```text
conversation-write-gateway tests: pass
identity-access-gateway tests: pass
```

Use-case tests prove:

- teacher desktop sessions receive teaching/private knowledge permissions
- student app sessions do not receive private knowledge permissions
- remote social command grants require Harness approval and cannot directly control local devices
- principal lookup resolves stored sessions
- invalid credentials are rejected

HTTP adapter tests prove:

- password sessions return `PrincipalContext`
- principal lookup requires bearer auth
- remote command grants require channel signature
- remote command grants return approval-bound principals

## Rollback

No legacy route is replaced yet. The existing FastAPI auth endpoints remain the active path until this gateway is integrated behind a feature flag or BFF route.

## Next Slice

Implement a legacy auth adapter or durable Go auth store behind `PasswordAuthenticator` and `SessionStore`, then add refresh/revoke behavior from the OpenAPI contract.
