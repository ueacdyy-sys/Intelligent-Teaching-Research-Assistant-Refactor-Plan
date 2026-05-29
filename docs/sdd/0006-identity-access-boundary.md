# SDD 0006: Identity And Access Boundary

## Problem

The root requirements require teacher login, student login, mobile/social remote command entry, and permission-aware agent execution. The legacy system already has password login, WeChat login, mobile auth, TOTP, channel sessions, and role checks, but these surfaces are split across UI routes and backend modules.

The refactor needs one identity boundary that all modules can consume before teaching, research, student app, knowledge access, and Agent Harness are migrated.

## Source Requirement References

- Teacher terminal: teacher desktop app supports QR login and password login.
- Student terminal: separate student app supports login, student archive, teaching materials, personal tutor, and scan-to-answer.
- Remote command entry: mobile/social platforms can send commands to the desktop assistant.
- Agent mode: the orchestrating agent calls teaching/research sub-agents and controls external applications.
- Knowledge isolation: public/private knowledge bases and local/cloud/remote node permissions differ.

## Current Implementation Evidence

Observed in the legacy project:

- `backend/app/api/endpoints/auth.py` exposes password, WeChat, refresh, logout, and `auth/me`.
- `backend/app/api/deps.py` builds `AuthenticatedUser` with `id`, `role`, and optional `channel`.
- `backend/app/dto/auth_dto.py` supports `teacher`, `student`, and `admin`; WeChat supports `teacher` and `admin`.
- `backend/app/api/endpoints/channels_mobile_auth*.py` and `services/channels/*` support mobile/channel auth and command parsing.
- Teacher and student login pages already exist in the UI, but future modules need a stronger shared principal contract.

## Scope

In scope:

- Define the new Identity And Access OpenAPI contract.
- Define a shared Principal Context JSON Schema.
- Define a minimal access matrix for root requirement roles and entry points.
- Add executable contract checks so future modules cannot silently weaken the boundary.

Out of scope:

- Rewriting the legacy auth endpoints in this slice.
- Implementing token signing or password storage in this slice.
- Implementing the full UI login flow in this slice.

## Contracts

- `contracts/openapi/identity-access.yaml`
- `contracts/auth/principal-context.schema.json`
- `contracts/auth/access-matrix.json`

## Clean Architecture Boundary

The Identity use cases own:

- session creation and refresh
- principal resolution
- role and scope assignment
- remote command grant creation
- data access policy projection

Outer adapters own:

- HTTP delivery
- JWT or opaque token format
- WeChat/OAuth/TOTP provider details
- secure desktop storage
- database persistence

Inner use cases must not depend on FastAPI, React, Electron, Tauri, PostgreSQL, Redis, or provider SDKs.

## Acceptance Criteria

- Contract includes password session, WeChat session start/callback, token refresh, session revoke, principal lookup, and remote command grant.
- All session responses return `PrincipalContext`.
- `PrincipalContext` includes role, entry point, scopes, knowledge access, student access, session metadata, and approval requirement.
- Access matrix includes teacher, student, admin, and remote channel actor profiles.
- Remote channel grants can submit commands but require Harness approval before local control.
- Student profiles cannot receive global private knowledge access.
- Root `npm test` runs identity contract tests.

## Rollback

This slice is additive. Legacy auth remains authoritative until the new identity boundary is implemented and routed behind feature flags.

## Observability And Performance Evidence

Implementation slices must record:

- login throughput and P95 for password and refresh
- token verification latency
- failed login and lockout counts
- remote command grant creation counts
- scope denial counts by role and entry point
