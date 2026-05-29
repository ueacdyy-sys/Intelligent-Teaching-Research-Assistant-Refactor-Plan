# P2 Identity WeChat Session Flow

## Decision

Identity And Access now implements the WeChat session start and callback endpoints that were already present in the public OpenAPI contract.

The slice keeps the architecture boundary clean:

- Domain owns WeChat start/callback DTOs.
- Use case owns the `WeChatAuthenticator` port.
- HTTP adapter maps the existing OpenAPI paths to use case calls.
- Bootstrap adapter provides a local provider for tests and desktop development.

## Root Requirement Link

The root requirements say the teacher side uses the same desktop app and supports WeChat QR login as well as account/password login. They also require social/mobile channels to become command entry points into the assistant.

## Implemented Contract

- `POST /v1/identity/sessions/wechat`
  - returns `202`
  - returns `state`, `authUrl`, `expiresAt`
- `POST /v1/identity/sessions/wechat/callback`
  - returns `201`
  - returns normal `SessionResponse` with `PrincipalContext`

The current local bootstrap provider uses `WECHAT_BOOTSTRAP_CODE`, defaulting to `ueacd`. Real WeChat OAuth calls remain an adapter follow-up.

## Verification

Targeted verification:

```powershell
go test ./services/identity-access-gateway/internal/usecase ./services/identity-access-gateway/internal/adapter/httpapi ./services/identity-access-gateway/internal/adapter/bootstrap ./services/identity-access-gateway/cmd/gateway
```

Result:

- use case tests passed
- HTTP adapter tests passed
- bootstrap adapter tests passed
- gateway composition compiled

Full gates:

- `npm test` passed.
- `npm run quality` passed.
- Latest quality report: `reports/quality-gate.current.json`
- Quality report status: `allPassed=true`
- Quality elapsed: `137640ms`

## Rollback

Keep password login routed and stop routing the two WeChat endpoints. The WeChat code is additive and does not change password login, refresh, revoke, principal lookup, or remote command grants.

## Next Evidence

After a real WeChat provider adapter exists, add:

- provider response validation tests.
- callback replay/expiration tests against durable state storage.
- HTTP benchmark traffic that mixes password login, WeChat callback, refresh, and revoke.
