# SDD 0063: Student App AI Tutor Requests List

## Problem

The Student App can now queue an AI tutor request for the authenticated student's own archive material, but a mobile client still needs a safe way to show queued, running, completed, and failed tutor jobs. Reusing the desktop Teaching Archive tutoring-analysis list route would expose filters such as `studentId` and `sourceArchiveOwnerType` that are implementation details for mobile clients.

This slice adds a Student App specific list contract for the student's own AI tutor requests. It completes the first mobile AI tutor loop: the app can list the student's archive materials, queue a tutor job, and refresh the job list to show status, result references, and personalized question-bank draft references when they exist.

## Source Requirement References

- Root requirement: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Root requirement: each student's growth materials can form a personal assistant / personalized tutoring helper.
- Root requirement: tutoring mode needs personalized question bank support after tutoring.
- SDD 0034: Teaching Archive owns tutoring-analysis query views.
- SDD 0061: Student App can queue AI tutor requests against own archive materials.
- SDD 0062: Student App can list own archive items.

## Scope

In scope:

- Add `GET /v1/student-app/ai-tutor-requests` beside the existing POST route.
- Require Agent API key and Principal Context.
- Require a Student App principal with own-student access and `STUDENT_OWN_READ`.
- Accept optional `status`, `pageSize`, and `cursor`.
- Force `sourceArchiveOwnerType=STUDENT` and `studentId` to the authenticated student's own ID.
- Reuse existing tutoring-analysis list persistence and response pagination shape.

Out of scope:

- Request detail endpoint.
- Chat streaming or interactive tutor conversation.
- Worker execution, OCR, RAG, model, scoring, or training dependencies.
- Personalized question-bank read endpoint.
- SQL schema changes.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml`

Go service:

- Domain: Student App AI tutor request-list normalization and principal gate.
- Use case: `ListStudentAppAITutorRequests`.
- HTTP adapter: `GET /v1/student-app/ai-tutor-requests`.
- PostgreSQL adapter: no new method; reuse existing tutoring-analysis request `List`.

## Acceptance Criteria

- Structure verification fails before implementation because the new SDD, domain, use-case, and HTTP list files are required.
- Domain tests prove Student App AI tutor list queries force `SourceArchiveOwnerType=STUDENT` and the authenticated own `StudentID`.
- Domain tests prove teacher desktop, remote social, service, and missing `STUDENT_OWN_READ` principals are rejected.
- Use-case tests prove the scoped query reaches the repository before page building.
- HTTP tests prove `GET /v1/student-app/ai-tutor-requests` returns only the authenticated student's own tutoring-analysis requests.
- HTTP tests prove `POST /v1/student-app/ai-tutor-requests` still queues a request.
- HTTP tests prove unsupported methods return `405`.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0063, remove the GET operation from the Student App AI tutor OpenAPI path file, remove Student App AI tutor request-list domain/use-case/HTTP files and tests, remove server wiring and structure verifier entries. The Student App AI tutor POST route from SDD 0061 remains available.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no SQL, package manifest, OCR/RAG/model/training dependency, or local secret changed.
