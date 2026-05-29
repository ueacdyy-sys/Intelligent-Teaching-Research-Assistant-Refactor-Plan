# P2 Identity Legacy Auth Adapter Report

## Scope

Added a legacy FastAPI password-auth adapter for the Go Identity Access Gateway.

This is a migration bridge: the new gateway can now validate passwords against the old backend while still projecting the new `PrincipalContext` and session lifecycle from Go.

## Files Added

- `services/identity-access-gateway/internal/adapter/legacyauth/authenticator.go`
- `services/identity-access-gateway/internal/adapter/legacyauth/authenticator_test.go`

## Files Updated

- `services/identity-access-gateway/cmd/gateway/main.go`
- `docs/sdd/0007-identity-access-gateway.md`

## Behavior

When `LEGACY_AUTH_BASE_URL` is set, the gateway uses:

```text
POST {LEGACY_AUTH_BASE_URL}/api/v1/auth/login/password
```

Request mapping:

- `identifier` passes through.
- `password` passes through.
- `requestedRole` is converted from `TEACHER/STUDENT/ADMIN` to `teacher/student/admin`.

Response mapping:

- legacy `user.id` -> `domain.Account.ID`
- legacy `user.displayName` -> `domain.Account.DisplayName`
- legacy `user.role` -> `domain.Account.Role`
- inactive or unauthorized legacy users -> `ErrInvalidCredentials`
- mismatched requested role -> `ErrForbidden`

## Architecture Boundary

The adapter implements only:

`usecase.PasswordAuthenticator`

It does not leak legacy tokens, FastAPI response DTOs, or old role casing into use cases.

The gateway still issues its own refactor-time access and refresh tokens until a durable `SessionStore` is implemented.

## Test Evidence

Command:

```powershell
go test ./services/identity-access-gateway/internal/adapter/legacyauth
```

Result:

```text
ok
```

Tests cover:

- successful teacher password auth mapping
- unauthorized legacy response to `ErrInvalidCredentials`
- requested-role mismatch to `ErrForbidden`
- malformed legacy response rejection

## Rollback

Unset `LEGACY_AUTH_BASE_URL` and the gateway returns to the local bootstrap authenticator using `BOOTSTRAP_PASSWORD` defaulting to `ueacd`.

Existing FastAPI auth routes remain active until the UI is explicitly migrated.

## Next Slice

Implement durable session persistence behind `SessionStore`, then add WeChat start/callback adapters.
