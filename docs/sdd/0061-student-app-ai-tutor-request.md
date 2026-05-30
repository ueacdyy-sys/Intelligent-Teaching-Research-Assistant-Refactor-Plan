# SDD 0061: Student App AI Tutor Request

## Problem

The root requirement says the Student App must include an AI tutoring assistant based on the student's learning archive and teaching resources. The refactor already has a Teaching Archive tutoring-analysis job queue, but the current creation path is a desktop/archive subresource: `POST /v1/teaching/archive-items/{archiveItemId}/tutoring-analysis-requests`.

This slice adds a Student App job entry that queues an AI tutor request for the authenticated student's own archive material. It hides the teaching/archive nested route from mobile clients, keeps Principal Context as the security boundary, reuses the existing tutoring-analysis persistence and worker handoff, and does not add AI model, OCR, RAG, training, or Python worker dependencies to the baseline runtime.

## Source Requirement References

- Root requirement: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Root requirement: each student's growth materials can form a personal assistant / personalized tutoring helper.
- Root requirement: tutoring mode needs personalized question bank support after tutoring.
- SDD 0033 through SDD 0037: Teaching Archive owns tutoring analysis request, query, worker result, worker claim, and lease guard.
- SDD 0060: Student App has a dedicated teaching-material list contract and should not consume desktop archive query shape directly.

## Scope

In scope:

- Add `POST /v1/student-app/ai-tutor-requests`.
- Require Agent API key and Principal Context.
- Require a Student App principal with own-student access, `STUDENT_OWN_READ`, and `TEACHING_READ`.
- Accept a bounded `studentArchiveItemId`, `analysisGoal`, and optional `questionBankIntent`.
- Resolve the archive item and require it to be the authenticated student's own student-owned archive material.
- Create the existing tutoring-analysis request shape and default `questionBankIntent` to `GENERATE_PERSONALIZED_CHECK`.
- Reuse existing tutoring-analysis repository persistence and worker claim/result APIs.

Out of scope:

- Chat streaming or interactive tutor conversation.
- Combining multiple archive items in one job.
- Teaching-material assignment selection.
- Student App UI.
- Question bank read endpoint.
- Python worker implementation.
- OCR, RAG, model, scoring, or training dependencies.
- SQL schema changes.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml`

Go service:

- Domain: Student App AI tutor request normalization and principal gate.
- Use case: `CreateStudentAppAITutorRequest`.
- HTTP adapter: `POST /v1/student-app/ai-tutor-requests`.
- PostgreSQL adapter: no new method; reuse existing tutoring-analysis request persistence.

## Acceptance Criteria

- Structure verification fails before implementation because the new SDD, OpenAPI path, domain, use-case, and HTTP files are required.
- Domain tests prove Student App AI tutor inputs normalize `studentArchiveItemId`, `analysisGoal`, and default `questionBankIntent`.
- Domain tests prove teacher desktop, remote social, service, and missing required scopes are rejected.
- Use-case tests prove the archive item is fetched before creating the request.
- Use-case tests prove teaching-owned material and other students' archive items are rejected without persistence writes.
- HTTP tests prove the endpoint returns the stable tutoring-analysis request `201` response.
- HTTP tests prove unsupported methods return `405`.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0061, remove the OpenAPI path reference and path file, remove Student App AI tutor domain/use-case/HTTP files and tests, remove server wiring and structure verifier entries. The existing Teaching Archive tutoring-analysis request path remains intact.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no SQL, package manifest, OCR/RAG/model/training dependency, or local secret changed.
