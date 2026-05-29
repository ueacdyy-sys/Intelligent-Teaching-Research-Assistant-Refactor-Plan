# SDD 0030: Teaching Archive Query View

## Problem

Teaching Archive can create metadata, but the root product cannot use archive materials until teacher and student surfaces can query them predictably.

The root requirements need student archive materials, teaching materials, tutoring analysis inputs, and later student-app access. A write-only archive boundary would force future UI and worker slices to invent their own read shapes, pagination, and filtering rules.

## Source Requirement References

- Root requirement: student archives contain all learning materials, including quizzes, papers, handouts, and homework.
- Root requirement: teaching materials are part of archive materials.
- Root requirement: archive materials can be sent to tutoring mode for analysis and exported.
- Root requirement: student app includes student archive and teaching materials.
- SDD 0029: Teaching Archive Material Intake creates archive metadata but intentionally does not expose a read view.
- Roadmap P3/P4: Teaching Mode and Student App require archive material APIs.

## Scope

In scope:

- Add `GET /v1/teaching/archive-items` to the Teaching Archive OpenAPI contract.
- Add cursor-paginated archive metadata listing.
- Support optional filters:
  - `ownerType`
  - `studentId`
  - `materialType`
- Keep the response sorted by `createdAt DESC, id DESC`.
- Add page-size bounds and an opaque cursor.
- Add PostgreSQL pagination indexes for the read path.
- Keep the endpoint metadata-only.

Out of scope:

- File upload, file download, or file-content reads.
- Full-text search or RAG retrieval.
- Tutoring analysis jobs.
- OCR/model execution.
- Principal-based authorization; this remains behind the local service API key until an SDD wires Identity principal scopes into Teaching Archive.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Endpoint: `GET /v1/teaching/archive-items`

## Acceptance Criteria

- Use-case tests prove query filters are normalized and passed to the reader port.
- Use-case tests prove pagination fetches one extra row and returns a next cursor when more records exist.
- Use-case tests prove invalid page sizes and cursors are rejected.
- HTTP tests prove `GET /v1/teaching/archive-items` returns `data` and `pageInfo`.
- HTTP tests prove the endpoint requires the configured local API key.
- HTTP tests prove validation errors use the shared error envelope.
- PostgreSQL adapter keeps ordering stable by `created_at DESC, id DESC`.
- Structure verification requires SDD 0030 and the new list use-case test.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove the `GET /v1/teaching/archive-items` contract, list use case, query domain helpers, HTTP handler branch, PostgreSQL list method and pagination indexes, SDD 0030 structure checks, README references, and this report. SDD 0029 archive creation remains valid.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that the read view returns metadata only and does not read file content.
