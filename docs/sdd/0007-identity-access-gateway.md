# SDD 0007: Identity Access Gateway

## Problem

The Identity And Access contract now defines the target principal boundary, but the refactor needs an executable service slice so teacher, student, and remote/social command entry can begin moving away from scattered legacy auth surfaces.

The first slice must prove the new service can project a shared `PrincipalContext` without coupling the inner identity rules to HTTP, token format, database persistence, React, Electron, or the old FastAPI code.

## Source Requirement References

- Root requirement: teacher desktop login, student app login, mobile/social remote command entry.
- SDD 0006: shared Identity And Access boundary.
- Whole system module map: Identity And Access is a shared module for teaching, research, student app, and Agent Harness.

## Scope

In scope:

- Implement a Go `identity-access-gateway` service module.
- Implement password session creation for teacher, student, and admin roles.
- Implement refresh token rotation.
- Implement session revoke.
- Implement current principal lookup from a bearer access token.
- Implement remote command grant creation from a signed channel request.
- Keep identity projection in use cases and domain structs, not in HTTP handlers.
- Use an in-memory session store and bootstrap authenticator for this first executable slice.
- Add a legacy FastAPI password-auth adapter behind the `PasswordAuthenticator` port.

Out of scope:

- Replacing the legacy auth database.
- Implementing WeChat callback provider integration.
- Implementing durable session persistence.
- Routing the existing UI to the new gateway.

## Contracts

- `contracts/openapi/identity-access.yaml`
- `contracts/auth/principal-context.schema.json`
- `contracts/auth/access-matrix.json`

## Acceptance Criteria

- `POST /v1/identity/sessions/password` returns a session with `PrincipalContext`.
- `POST /v1/identity/sessions/refresh` rotates access and refresh tokens.
- `DELETE /v1/identity/sessions/{sessionId}` revokes access and refresh tokens for that session.
- `GET /v1/identity/principal` resolves a stored session by bearer token.
- `POST /v1/identity/remote-command-grants` requires `X-Channel-Signature`.
- Remote command grants include `AGENT_COMMAND_SUBMIT`, exclude `DEVICE_LOCAL_CONTROL`, and require Harness approval.
- Student app sessions exclude private knowledge access and use own-student access.
- Old access and refresh tokens stop working after refresh or revoke.
- `LEGACY_AUTH_BASE_URL` can route password verification to the legacy FastAPI auth endpoint without changing inner use cases.
- Use-case tests run without HTTP, database, or provider SDKs.
- HTTP adapter tests verify status codes and JSON response shape.
- Root `npm test` includes the new Go module.

## Rollback

This service is additive and is not yet routed by the legacy UI. If it fails, keep all clients on the existing legacy auth endpoints while the gateway is corrected.

## Observability And Performance Evidence

Future runtime slices should add:

- login request count and error count by entry point
- token lookup latency
- remote grant count by provider
- Harness approval-required count
- invalid credential and invalid channel signature counts
