# SDD 0059: Teaching Archive Server Config Refactor

## Problem

The Teaching Archive HTTP server constructor has grown into a long positional dependency list. Each new teaching, grading, tutoring, attendance, or Student App slice forces callers to add another argument in the correct position, and most HTTP tests now carry repeated `nil` placeholders for unrelated use cases.

This is a behavior-preserving refactor to protect future whole-system slices. The server still exposes the same routes and still delegates to the same use cases, but its composition boundary changes from positional arguments to a named `ServerConfig` struct so future modules can add dependencies without silent miswiring.

## Source Requirement References

- Root requirement: Teaching Mode keeps quiz, AI grading, intelligent rollcall, resources, tutoring, whiteboard, and archive behavior while the implementation is rebuilt.
- Root requirement: Student App keeps scan-to-answer and teaching-material interactions as later surfaces.
- Whole-system invariant: modules are execution slices under the immutable root requirements, not isolated rewrites.
- SDD 0014: strict quality gate rejects structure drift and oversized implementation files.
- SDD 0041, SDD 0042, SDD 0043, and SDD 0050: quality headroom slices must keep later behavior work separate from mechanical file surgery.
- SDD 0058: Student App scan answer added another server dependency and exposed the positional-constructor risk.

## Scope

In scope:

- Add `httpapi.ServerConfig` as the Teaching Archive HTTP composition contract.
- Change `httpapi.NewServer` to accept `ServerConfig`.
- Update gateway startup wiring to pass named dependencies.
- Update HTTP adapter tests to pass named dependencies and remove positional `nil` placeholders.
- Keep all route paths, operation IDs, request/response shapes, status codes, authorization checks, and runtime defaults unchanged.
- Keep `npm test` Docker-free.

Out of scope:

- New API behavior.
- OpenAPI contract changes.
- SQL schema changes.
- Database performance changes.
- Worker, OCR, RAG, model, scoring, or training dependencies.
- Student App UI or SDK generation.
- Reorganizing use-case constructors outside the HTTP adapter boundary.

## Contracts

Updated structure contract:

- `tools/verify-structure.mjs`

Go service:

- `services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go`
- `services/teaching-archive-gateway/internal/adapter/httpapi/server.go`
- `services/teaching-archive-gateway/cmd/gateway/main.go`
- HTTP adapter tests that call `httpapi.NewServer`.

## Acceptance Criteria

- Structure verification fails before implementation because `server_config.go` is missing.
- `ServerConfig` names every HTTP server dependency currently accepted by `NewServer`.
- `NewServer` accepts one `ServerConfig` argument and maps it to the existing internal server fields.
- Gateway startup uses named `ServerConfig` fields and keeps `AGENT_API_KEY` defaulting to `ueacd`.
- HTTP tests use named `ServerConfig` fields instead of long positional `nil` lists.
- Existing Teaching Archive HTTP tests still prove route behavior with no contract changes.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Restore the previous positional `NewServer` signature, revert gateway and test call sites to positional arguments, remove `server_config.go`, remove the SDD 0059 structure entries, and delete this SDD. Because the slice is behavior-preserving, rollback only changes composition code.

## Observability And Performance Evidence

Record:

- failing `npm run verify:structure` evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no package manifest, SQL, OpenAPI, OCR/RAG/model/training dependency, or runtime secret changed.
