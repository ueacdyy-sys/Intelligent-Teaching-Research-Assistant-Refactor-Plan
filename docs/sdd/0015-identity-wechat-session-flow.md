# SDD 0015: Identity WeChat Session Flow

## Problem

The root requirements explicitly require teacher desktop login through WeChat QR scan as well as password login. The Identity OpenAPI contract already exposes WeChat session start and callback endpoints, but the Go gateway currently only implements password login, refresh, revoke, principal lookup, remote command grants, and session persistence.

This leaves a whole-system entry point as a paper contract instead of an executable slice.

## Source Requirement References

- Root requirement: teacher side uses the same desktop app and supports WeChat QR login plus password login.
- Root requirement: mobile/social platforms can become command entry points into the assistant.
- SDD 0006: Identity Access boundary includes WeChat session start/callback in the public contract.
- SDD 0014: strict quality gate must pass for merge-ready slices.

## Scope

In scope:

- Add domain request/response models for WeChat session start and callback.
- Add an inner `WeChatAuthenticator` port owned by the use case layer.
- Add HTTP handlers for:
  - `POST /v1/identity/sessions/wechat`
  - `POST /v1/identity/sessions/wechat/callback`
- Create a session with a shared `PrincipalContext` after callback verification.
- Limit WeChat login to teacher/admin desktop entry points in this slice.
- Add a local bootstrap provider so tests and local runtime do not need external WeChat credentials.

Out of scope:

- Real WeChat OAuth API calls.
- QR image generation for UI.
- Long-polling login status.
- Student mobile app login through WeChat.
- Persisting pending QR states across process restarts.

## Contracts

- Public OpenAPI paths remain:
  - `POST /v1/identity/sessions/wechat`
  - `POST /v1/identity/sessions/wechat/callback`
- Inner port:
  - `StartWeChatLogin(ctx, input, state, expiresAt)`
  - `CompleteWeChatLogin(ctx, input)`
- Local bootstrap callback code defaults to `ueacd`.

## Acceptance Criteria

- Use-case tests prove WeChat start returns state/auth URL/expiresAt.
- Use-case tests prove WeChat callback creates a teacher/admin session with `PrincipalContext`.
- Use-case tests prove student or non-desktop WeChat login is rejected.
- HTTP adapter tests prove both WeChat endpoints use the existing contract shape.
- Root `npm test` passes.
- Strict `npm run quality` passes.

## Rollback

Disable routing to the WeChat endpoints and keep password login as the working teacher/admin entry path. The new port is additive and does not change password, refresh, revoke, principal lookup, or remote command grants.

## Observability And Performance Evidence

This slice is correctness and boundary work. Record:

- status code behavior for start/callback.
- strict quality gate result.
- future HTTP benchmark once real QR callback traffic exists.
