# SDD 0032: Teaching Archive Student Query Scope

## Problem

Teaching Archive now requires a principal context, but the list use case still passes the caller's filters directly to the repository after authorization. That is not strict enough for the student app and assigned-class teacher flows: a principal can be authorized to read archive data while the actual repository query remains broader than the principal's student access.

The list use case must convert principal access into repository query constraints before any storage adapter runs.

## Source Requirement References

- Root requirement: student app can access a student's own archive and teaching materials.
- Root requirement: teaching mode contains student archives and teaching materials.
- Root requirement: every student has archive material that can become a personal tutoring knowledge base.
- SDD 0006: Identity Access defines `PrincipalContext`, scopes, and student access.
- SDD 0030: Teaching Archive lists archive metadata with cursor pagination.
- SDD 0031: Teaching Archive consumes principal context and rejects forbidden principals.

## Scope

In scope:

- Scope `OwnerType=STUDENT` archive list queries by principal before repository access.
- Student principals with `STUDENT_OWN_READ` and own student access can omit `studentId`; the use case scopes the query to their own student archive.
- Student principals cannot override the scoped student ID to another student.
- Teacher/admin principals with assigned/all access keep authorized student archive reads.
- Assigned teacher principals with explicit `studentIds` in the principal context scope unfiltered student archive queries to those IDs.
- Repository query shape supports a bounded list of principal-scoped student IDs.
- HTTP tests prove a student principal listing student archives without `studentId` does not receive another student's archive item.

Out of scope:

- Class roster storage.
- Changing the principal context schema.
- Teaching material recommendation rules.
- TypeScript SDK generation.
- OCR/RAG/model worker integration.

## Contracts

Updated implementation contracts:

- `services/teaching-archive-gateway/internal/domain.ArchiveItemQuery`
- `services/teaching-archive-gateway/internal/domain.ScopeListArchiveItems`
- `services/teaching-archive-gateway/internal/adapter/postgres.ArchiveRepository.List`

Public HTTP shape is unchanged:

- `GET /v1/teaching/archive-items`
- Existing query parameters and response schema stay compatible.

## Acceptance Criteria

- Domain tests prove a student principal without `studentId` is scoped to self for student archive reads.
- Domain tests prove an assigned teacher principal with explicit `studentIds` scopes unfiltered student archive reads to those IDs.
- Use-case tests prove scoped queries are sent to the repository before data is read.
- HTTP tests prove a student principal cannot receive another student's archive item when omitting `studentId`.
- Cursor pagination response shape remains unchanged.
- Structure verification requires SDD 0032.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the scoping helper, the `StudentIDs` repository query constraint, SDD 0032 structure checks, and the new tests. SDD 0031 principal authorization remains the fallback boundary.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that list scoping happens before repository access.
