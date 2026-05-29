# SDD 0031: Teaching Archive Principal Authorization

## Problem

Teaching Archive now creates and lists metadata, but both endpoints still trust only the local service API key. That is not enough for the root product because teacher, student, and later mobile app surfaces must not see or write each other's archive data.

The Identity module already defines a shared `PrincipalContext` with role, scopes, and student access. Teaching Archive needs to consume that contract without importing Identity service internals, so archive read/write rules become explicit and testable.

## Source Requirement References

- Root requirement: teacher desktop and student app login must exist.
- Root requirement: student app can access a student's own archive and teaching materials.
- Root requirement: teaching mode contains student archives and teaching materials.
- Root requirement: social/mobile command entry must route through the coordinating assistant instead of receiving direct module permissions.
- SDD 0006: Identity Access defines `PrincipalContext`, scopes, and student access.
- SDD 0029: Teaching Archive creates metadata.
- SDD 0030: Teaching Archive lists metadata.

## Scope

In scope:

- Require `X-Principal-Context` in Teaching Archive requests in addition to `X-Agent-Api-Key`.
- Treat `X-Principal-Context` as base64url JSON matching the shared principal semantics.
- Authorize archive creation:
  - teaching-owned materials require `TEACHING_WRITE`.
  - student-owned archive writes require `STUDENT_ARCHIVE_WRITE` for assigned/all student access or `STUDENT_OWN_WRITE` for own student access.
- Authorize archive listing:
  - teaching-owned materials require `TEACHING_READ`.
  - student-owned archive reads require `STUDENT_ASSIGNED_READ` for assigned/all student access or `STUDENT_OWN_READ` for own student access.
- Reject missing/invalid principal context with `401`.
- Reject authenticated but insufficient scopes/access with `403`.

Out of scope:

- Calling the Identity service at request time.
- JWT validation or cryptographic signing of the principal header.
- Class roster or student assignment storage.
- TypeScript SDK generation.
- Replacing the local service API key boundary.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/auth/principal-context.schema.json` is consumed as the semantic source and not changed in this slice.

Go service:

- `services/teaching-archive-gateway`
- Header: `X-Principal-Context`

## Acceptance Criteria

- Use-case tests prove teacher/admin principals can create student archive metadata through assigned/all student access.
- Use-case tests prove student principals can create only their own student archive metadata.
- Use-case tests prove remote/social principals cannot create or list Teaching Archive data.
- Use-case tests prove student principals cannot list another student's archive metadata.
- HTTP tests prove missing principal context returns `401`.
- HTTP tests prove insufficient principal context returns `403`.
- HTTP tests prove allowed principal context keeps the existing response shapes.
- Structure verification requires SDD 0031 and authorization module/test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the principal header requirement, Teaching Archive authorization domain helpers, HTTP principal parser, authorization tests, SDD 0031 structure checks, OpenAPI security update, and README references. The SDD 0029/0030 API key-only archive endpoints remain as the fallback.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that Teaching Archive does not import Identity service internals.
