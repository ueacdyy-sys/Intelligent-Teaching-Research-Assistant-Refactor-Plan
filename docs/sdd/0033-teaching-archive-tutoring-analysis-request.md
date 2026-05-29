# SDD 0033: Teaching Archive Tutoring Analysis Request

## Problem

The root requirement says archive material can be transferred into tutoring mode for analysis, and later used to create personalized tutoring or question-bank checks. Teaching Archive currently stores and lists archive metadata, but it has no explicit handoff contract to tutoring mode.

The refactor needs a small, testable request boundary that lets an authorized teacher or student ask the system to analyze an archive item without pulling OCR, RAG, or model dependencies into the baseline runtime.

## Source Requirement References

- Root requirement: archive material includes student archives and teaching materials.
- Root requirement: archive material can be transferred to tutoring mode for analysis.
- Root requirement: tutoring mode should add a personalized question bank to detect student level after tutoring.
- Root requirement: model/training/OCR dependencies must remain worker-side concerns, not baseline runtime.
- SDD 0029: Teaching Archive creates metadata.
- SDD 0031: Teaching Archive requires principal authorization.
- SDD 0032: Teaching Archive scopes student archive reads before repository access.

## Scope

In scope:

- Add a metadata-only tutoring analysis request for an existing archive item.
- Endpoint: `POST /v1/teaching/archive-items/{archiveItemId}/tutoring-analysis-requests`.
- Require the same `X-Agent-Api-Key` and `X-Principal-Context` headers as archive create/list.
- Validate that the principal can read the target archive item before queuing the request.
- Store request metadata with `QUEUED` status and a reserved personalized-question-bank intent.
- Keep OCR/RAG/model execution out of this slice.

Out of scope:

- Running tutoring analysis.
- Creating actual generated questions.
- Worker scheduling.
- File content reads.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Use case: `CreateTutoringAnalysisRequest`

## Acceptance Criteria

- Domain tests prove request metadata normalizes the analysis goal and starts as `QUEUED`.
- Use-case tests prove an authorized student can request analysis for their own archive item.
- Use-case tests prove a student cannot request analysis for another student's archive item.
- Use-case tests prove a remote/social principal cannot request tutoring analysis.
- HTTP tests prove successful request creation returns `201` with stable response fields.
- HTTP tests prove forbidden principal returns `403`.
- PostgreSQL adapter stores request metadata without reading archive file content.
- Structure verification requires SDD 0033 and the tutoring use-case/test files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the tutoring analysis request endpoint, request table/indexes, use case, domain types, HTTP route, SDD 0033 structure checks, and tests. Archive metadata create/list from SDD 0029-0032 remains intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model dependencies were added.
