# SDD 0016: Identity Remote Command Replay Guard

## Problem

The root requirements make mobile and social platforms command entry points for the desktop assistant. The current Identity Access Gateway requires `X-Channel-Signature`, `nonce`, and `issuedAt` for remote command grants, but the use case only checks that these fields exist.

A captured signed request can therefore be replayed to mint another remote command grant during high-concurrency or multi-worker operation.

## Source Requirement References

- Root requirement: users can command the desktop assistant from mobile social apps such as WeChat and QQ.
- Root requirement: the assistant can control local desktop applications after intent routing, so remote commands must be approval-bound and replay-resistant.
- SDD 0006: Identity Access boundary includes remote command grant creation.
- SDD 0007: `POST /v1/identity/remote-command-grants` requires a signed channel request.
- SDD 0014: strict quality gate must pass for merge-ready slices.

## Scope

In scope:

- Enforce a remote command freshness window against `issuedAt`.
- Reject requests whose `issuedAt` is too old or too far in the future.
- Add an inner `RemoteCommandReplayGuard` port owned by the use case layer.
- Provide an in-memory guard for local smoke tests and no-database runtime.
- Make the PostgreSQL session store implement the replay guard for multi-worker runtime.
- Preserve the existing remote grant response contract and harness-approval requirement.

Out of scope:

- Full channel signature cryptography. This slice keeps the existing shared-secret header behavior.
- Durable replay protection for non-PostgreSQL distributed stores.
- Agent Harness command execution.
- User-facing mobile app UI.

## Contracts

- Public path remains `POST /v1/identity/remote-command-grants`.
- Request fields remain `provider`, `externalSubjectId`, `commandPreview`, `nonce`, and `issuedAt`.
- Replayed `(provider, externalSubjectId, nonce)` is rejected as `401 UNAUTHORIZED`.
- Stale or future-skewed `issuedAt` is rejected as `422 VALIDATION_ERROR`.
- The PostgreSQL schema gains `identity_remote_command_nonces` with a uniqueness key on `(provider, external_subject_id, nonce)`.

## Acceptance Criteria

- Use-case tests prove the first nonce is accepted and a replayed nonce is rejected.
- Use-case tests prove stale `issuedAt` is rejected.
- Use-case tests prove future-skewed `issuedAt` is rejected.
- HTTP adapter tests prove duplicate remote grant requests return `401`.
- HTTP adapter tests prove stale remote grant requests return `422`.
- PostgreSQL adapter tests prove the replay guard accepts a nonce only once.
- Root `npm test` passes.
- Strict `npm run quality` passes.

## Rollback

Disable the replay guard wiring and fall back to the previous signed remote command grant path. The public request and response shape stays unchanged, so rollback does not require UI or SDK changes.

## Observability And Performance Evidence

Record:

- status code behavior for accepted, replayed, stale, and future-skewed remote grants.
- strict quality gate result.
- future HTTP mixed-workload benchmark including remote command grants.

