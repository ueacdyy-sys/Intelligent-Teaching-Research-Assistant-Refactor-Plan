# SDD 0029: Teaching Archive Material Intake

## Problem

Teaching Mode needs a real archive boundary before UI and AI workers can safely share student learning materials, teaching materials, tutoring analysis input, and future AI grading/OCR jobs.

The root requirements replace the old screenshot feature with archive materials: student archives, teaching materials, and a personalized tutoring assistant. Without a contract-first archive intake API, later UI, student app, tutoring, and OCR work will either duplicate metadata shapes or leak file/OCR details into unrelated modules.

## Source Requirement References

- Root requirement: Teaching Mode includes quizzes, AI grading, attendance, resource retrieval, tutoring mode, whiteboard, and archive materials.
- Root requirement: archive materials include student learning materials such as quizzes, papers, handouts, and homework.
- Root requirement: archive materials can be routed into tutoring mode for analysis and exported.
- Root requirement: teaching materials are part of the archive.
- Root requirement: AI grading must reserve OCR or handwriting-recognition capability.
- Roadmap P3: Teaching Mode owns archive material and tutoring job APIs.

## Scope

In scope:

- Add a Teaching Archive OpenAPI contract.
- Add a SQL metadata contract for archive items.
- Add a Go `teaching-archive-gateway` service skeleton.
- Implement `POST /v1/teaching/archive-items`.
- Validate owner, material type, title, content reference, analysis intents, and student ownership rules.
- Persist archive metadata through a repository port.
- Reserve OCR status in metadata without adding OCR/model dependencies.
- Keep raw file storage out of this slice.

Out of scope:

- Uploading or reading file content.
- OCR, handwriting recognition, AI grading, tutoring analysis, or model calls.
- Student mobile UI.
- Teacher workbench UI.
- Export jobs.
- Generated TypeScript SDK.
- Replacing legacy Teaching Mode routes.

## Contracts

New contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Endpoint: `POST /v1/teaching/archive-items`

## Acceptance Criteria

- Use-case tests prove student-owned archive items require `studentId`.
- Use-case tests prove teaching materials can be created without `studentId`.
- Use-case tests prove archive metadata is normalized and persisted.
- Use-case tests prove unsupported material types and analysis intents are rejected.
- HTTP tests prove the endpoint returns a stable `201` response shape.
- HTTP tests prove the endpoint requires the configured local API key.
- HTTP tests prove validation errors use the shared error envelope.
- Structure verification requires SDD 0029, the contracts, service files, and tests.
- `npm test` includes `teaching-archive-gateway`.
- `npm run quality` includes `teaching-archive-gateway` in Go vet and formatting checks.

## Rollback

Remove the Teaching Archive OpenAPI/SQL contracts, `services/teaching-archive-gateway`, SDD 0029 structure checks, package script changes, quality gate changes, and README references. Legacy Teaching Mode remains untouched because no traffic is routed to this new gateway in this slice.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that OCR/model dependencies are not installed and file content is not read.
