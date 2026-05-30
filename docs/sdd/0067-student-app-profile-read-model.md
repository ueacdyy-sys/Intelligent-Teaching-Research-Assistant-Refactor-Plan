# SDD 0067: Student App Profile Read Model

## Problem

The root requirement says the Student App must support account login and then
use the student's own archive, teaching materials, AI tutor, personalized
question bank, and scan-to-answer flows. The refactor now has those Student App
Teaching Archive contracts, but the Identity gateway still exposes only the full
`PrincipalContext` shape to mobile clients.

That full shape is an internal authorization boundary. A mobile profile screen
needs a stable student-facing read model: who is signed in, which `studentId`
will be used for own-student Teaching Archive calls, and when the session
expires. The current student principal projection also marks access as `OWN`
without carrying the concrete own `studentId`, which is too weak for downstream
own-student gates.

## Source Requirement References

- Root requirement: Student App includes account login, AI tutor, student
  archive, teaching materials, personalized question bank, and scan-to-answer.
- SDD 0007: Identity Access Gateway creates student app sessions and shared
  Principal Context.
- SDD 0060 through SDD 0066: Student App Teaching Archive routes require
  own-student principal context.

## Scope

In scope:

- Add `GET /v1/student-app/profile` to the Identity Access API.
- Require a bearer access token.
- Return a Student App profile read model with `studentId`, `principalId`,
  `displayName`, `role`, `entryPoint`, `sessionId`, `issuedAt`, and `expiresAt`.
- Reject non-Student App or non-student principals with `403`.
- Project student password sessions with `studentAccess.mode=OWN` and
  `studentAccess.studentIds=[account.ID]`.
- Keep full scopes, knowledge access, and internal permission shape out of the
  Student App profile response.

Out of scope:

- Student roster/master-data storage.
- Profile editing.
- Avatar upload.
- Parent or guardian accounts.
- Routing existing UI to the new endpoint.
- OAuth provider or WeChat provider changes.

## Contracts

Updated contracts:

- `contracts/openapi/identity-access.yaml`

Go service:

- Domain: Student App profile projection and principal gate.
- Use case: `GetStudentAppProfile`.
- HTTP adapter: `GET /v1/student-app/profile`.
- Persistence: reuse existing session lookup; no new storage.

## Acceptance Criteria

- Domain tests prove Student App profile projection requires a Student App
  student principal with own-student id.
- Domain tests reject teacher, remote, service, and missing-own-student-id
  principals.
- Use-case tests prove the profile is projected from an access token and teacher
  sessions are forbidden.
- Password-session tests prove Student App sessions include the own
  `studentAccess.studentIds` value.
- HTTP tests prove `/v1/student-app/profile` returns the profile model for a
  student token.
- HTTP tests prove the response does not leak `scopes` or `knowledgeAccess`.
- HTTP tests prove missing bearer tokens return `401`.
- Structure verification requires SDD 0067 and the new domain/use-case/HTTP
  files.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0067, the Student App profile OpenAPI path/schema, the domain
projection, use-case method, HTTP adapter and tests, and structure verifier
entries. Keep the generic `/v1/identity/principal` endpoint and existing session
creation behavior available.

## Observability And Performance Evidence

Record:

- failing structure and Go test evidence before implementation.
- targeted Identity Access Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json`
  summary.
- confirmation that no SQL table, package, OAuth provider, OCR/RAG/model, or
  training dependency was added.
