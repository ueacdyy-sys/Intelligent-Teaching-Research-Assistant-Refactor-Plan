# SDD 0062: Student App Archive Items List

## Problem

The root requirement says the Student App must expose each student's learning archive: quizzes, papers, handouts, homework, answer resources, and other growth materials that can later feed AI tutoring and personalized question-bank checks.

The refactor already has a generic Teaching Archive list endpoint, but mobile clients should not depend on the desktop/archive query shape or be able to pass arbitrary `studentId` and `ownerType` filters. This slice adds a Student App specific archive list contract that always scopes data to the authenticated student's own archive.

## Source Requirement References

- Root requirement: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Root requirement: student archive materials include quiz, paper, handout, homework, and student learning resources.
- Root requirement: each student's growth materials can form a personal assistant / personalized tutoring helper.
- SDD 0030 and SDD 0032: Teaching Archive owns list pagination and principal-scoped student archive reads.
- SDD 0060 and SDD 0061: Student App receives dedicated mobile contracts instead of consuming desktop archive routes directly.

## Scope

In scope:

- Add `GET /v1/student-app/archive-items`.
- Require Agent API key and Principal Context.
- Require a Student App principal with own-student access and `STUDENT_OWN_READ`.
- Accept optional `materialType`, `pageSize`, and `cursor`.
- Force `ownerType=STUDENT` and `studentId` to the authenticated student's own ID.
- Allow only student archive material types: `QUIZ`, `PAPER`, `HANDOUT`, and `HOMEWORK`.
- Reuse existing archive list persistence and response pagination shape.

Out of scope:

- Archive item detail endpoint.
- Teaching material listing; covered by SDD 0060.
- AI tutor job creation; covered by SDD 0061.
- Student App UI.
- Personalized question-bank list endpoint.
- SQL schema changes.
- OCR, RAG, model, scoring, or training dependencies.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.student-app-archive-items.path.yaml`

Go service:

- Domain: Student App archive-list normalization and principal gate.
- Use case: `ListStudentAppArchiveItems`.
- HTTP adapter: `GET /v1/student-app/archive-items`.
- PostgreSQL adapter: no new method; reuse existing archive item `List`.

## Acceptance Criteria

- Structure verification fails before implementation because the new SDD, OpenAPI path, domain, use-case, and HTTP files are required.
- Domain tests prove Student App archive queries force `OwnerType=STUDENT` and the authenticated own `StudentID`.
- Domain tests prove `TEACHING_MATERIAL` is rejected on the Student App archive endpoint.
- Domain tests prove teacher desktop, remote social, service, and missing `STUDENT_OWN_READ` principals are rejected.
- Use-case tests prove the scoped query reaches the repository before page building.
- HTTP tests prove the endpoint returns only the authenticated student's own archive items.
- HTTP tests prove unsupported methods return `405`.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0062, remove the OpenAPI path reference and path file, remove Student App archive-list domain/use-case/HTTP files and tests, remove server wiring and structure verifier entries. The generic Teaching Archive list endpoint remains available.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no SQL, package manifest, OCR/RAG/model/training dependency, or local secret changed.
