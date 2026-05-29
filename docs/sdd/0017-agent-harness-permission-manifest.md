# SDD 0017: Agent Harness Permission Manifest

## Problem

The root requirements say the assistant can receive mobile/social commands and eventually control desktop applications. Identity now marks remote command principals as approval-bound, but there is no executable Agent Harness boundary that can decide whether a requested local file, process, or browser action is allowed, denied, or must wait for approval.

Without this boundary, later agent slices could accidentally couple local control directly to API handlers or AI workers.

## Source Requirement References

- Root requirement: the orchestrating agent can call teaching/research sub-agents and control external applications.
- Root requirement: mobile social commands can ask the desktop assistant to act on the computer.
- SDD 0000: external application control must pass through Agent Harness.
- SDD 0006: remote channel grants can submit commands but require Harness approval before local control.
- SDD 0016: remote command grants are replay-resistant before entering downstream command flow.

## Scope

In scope:

- Add a permission manifest contract for local file, process, and browser dry-run actions.
- Add a Rust Agent Harness crate because Rust owns local trust boundaries.
- Implement policy evaluation only; no real file, process, browser, or shell execution.
- Return one of `ALLOW_DRY_RUN`, `APPROVAL_REQUIRED`, or `DENY`.
- Require `DEVICE_LOCAL_CONTROL` before dry-run local control can be allowed.
- Convert `requiresHarnessApproval` principals into `APPROVAL_REQUIRED` instead of direct allow.
- Wire Rust tests into the strict quality gate.

Out of scope:

- Real desktop automation.
- Persistent approval queues.
- UI approval prompts.
- Browser automation adapters.
- AI intent parsing.

## Contracts

- `contracts/harness/permission-manifest.schema.json`
- `contracts/harness/permission-manifest.current.json`
- Rust crate: `services/agent-harness`

The manifest is additive and separate from Identity contracts. It consumes the shared `PrincipalContext` semantics through the scope strings and `requiresHarnessApproval` flag.

## Acceptance Criteria

- Rust tests prove an admin-like principal can dry-run an allowed file action.
- Rust tests prove a remote/social principal receives `APPROVAL_REQUIRED`.
- Rust tests prove a principal without `DEVICE_LOCAL_CONTROL` is denied when approval is not required.
- Rust tests prove unlisted processes are denied.
- `npm test` runs Rust tests.
- `npm run quality` runs Rust tests and Rust formatting checks.

## Rollback

Remove the `services/agent-harness` crate and stop invoking `npm run test:rust`. No runtime route depends on this slice yet, so rollback does not affect Identity, Conversation Write Gateway, or PostgreSQL profiles.

## Observability And Performance Evidence

This slice is a local trust-boundary foundation. Record:

- quality gate result.
- policy decision behavior for allow, approval required, and deny.
- future dry-run benchmark once process/file/browser adapters exist.

