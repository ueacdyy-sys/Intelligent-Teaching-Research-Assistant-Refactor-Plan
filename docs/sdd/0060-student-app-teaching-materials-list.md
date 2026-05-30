# SDD 0060: Student App Teaching Materials List

## Problem

The root requirement says the Student App must let students access teacher preparation resources and teaching materials. The generic Teaching Archive list endpoint can already filter teaching-owned material metadata, but it exposes the desktop/archive query shape directly to the mobile student surface. The Student App needs its own bounded contract so mobile clients can list teaching materials without knowing archive owner filters or student archive internals.

This slice adds a Student App read endpoint that lists teaching-owned `TEACHING_MATERIAL` metadata. It reuses the existing archive read model and PostgreSQL query path, keeps Principal Context as the security boundary, and does not add content storage, file download, OCR, RAG, model, or training dependencies.

## Source Requirement References

- Root requirement: Student App includes login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Root requirement: Student App should access teacher preparation resources and student answer/learning resources.
- Root requirement: Teaching Mode includes archive materials and teaching materials.
- SDD 0006: the student app identity profile uses Student App entry point and own-student access.
- SDD 0029 through SDD 0032: Teaching Archive owns archive material intake, query, principal authorization, and student scoping.
- SDD 0058: Student App scan answer added a backend entry while keeping QR payloads as locators, not auth tokens.

## Scope

In scope:

- Add `GET /v1/student-app/teaching-materials`.
- Require Agent API key and Principal Context.
- Require a Student App principal with `TEACHING_READ`.
- Return only teaching-owned `TEACHING_MATERIAL` archive metadata.
- Support bounded `pageSize` and `cursor` pagination using the existing archive cursor contract.
- Reuse the existing archive repository `List` query; no new SQL table or persistence method.

Out of scope:

- File download or content streaming.
- Student archive list endpoint.
- AI tutor job creation.
- Personalized question bank generation or reading.
- Material assignment/visibility rules by class.
- OpenAPI SDK generation.
- OCR, RAG, model, scoring, or training dependencies.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.student-app-teaching-materials.path.yaml`

Go service:

- Domain: Student App teaching-material query normalization and principal gate.
- Use case: `ListStudentAppTeachingMaterials`.
- HTTP adapter: `GET /v1/student-app/teaching-materials`.
- PostgreSQL adapter: reuse existing archive `List`.

## Acceptance Criteria

- Structure verification fails before implementation because the new SDD, OpenAPI path, domain, use-case, and HTTP files are required.
- Domain tests prove Student App teaching-material queries force `OwnerType=TEACHING` and `MaterialType=TEACHING_MATERIAL`.
- Domain tests prove Student App teaching-material queries reject teacher desktop, remote social, service, and missing `TEACHING_READ` principals.
- Use-case tests prove repository queries are scoped before reading.
- Use-case tests prove invalid pagination fails before repository access.
- HTTP tests prove the endpoint returns the stable archive list response for a Student App principal.
- HTTP tests prove unsupported methods return `405`.
- OpenAPI exposes the Student App path with the existing archive list response shape.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0060, remove the OpenAPI path reference and path file, remove Student App teaching-material domain/use-case/HTTP files and tests, remove server wiring and structure verifier entries. The generic Teaching Archive list endpoint remains available.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no SQL, package manifest, OCR/RAG/model/training dependency, or local secret changed.
