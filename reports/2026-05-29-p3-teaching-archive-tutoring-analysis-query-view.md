# P3 Teaching Archive Tutoring Analysis Query View

## Summary

SDD 0034 adds a metadata-only status/list view for tutoring analysis requests:

`GET /v1/teaching/tutoring-analysis-requests`

The slice completes the lifecycle started in SDD 0033 far enough for teacher/student UI polling and later worker integration, while keeping OCR, RAG, model, and training dependencies outside the baseline runtime.

## Red Evidence

Before implementation, the new SDD 0034 tests failed as expected:

```text
undefined: domain.EncodeTutoringAnalysisRequestCursor
undefined: domain.NormalizeListTutoringAnalysisRequestsInput
undefined: domain.ListTutoringAnalysisRequestsInput
undefined: domain.BuildTutoringAnalysisRequestPage
undefined: usecase.NewListTutoringAnalysisRequests
undefined: domain.TutoringAnalysisRequestQuery
too many arguments in call to httpapi.NewServer
```

During review, a tighter authorization test also failed before the fix:

```text
TestListTutoringAnalysisRequestsRejectsStudentTeachingRequestMetadata
error = <nil>, want ErrForbidden
```

## Implementation

- Added SDD 0034 as the query/status continuation for tutoring analysis requests.
- Added OpenAPI contract for `GET /v1/teaching/tutoring-analysis-requests`.
- Added SQL indexes for status, source owner, source student, requested principal, archive item, and cursor pagination.
- Added domain query normalization, cursor encoding/decoding, page building, and principal scoping.
- Added `ListTutoringAnalysisRequests` use case.
- Added HTTP list route and response DTO.
- Added PostgreSQL list query and adapter test proving SQL filters are preserved.
- Kept create request metadata in `tutoring_analysis_request.go` and moved query behavior into `tutoring_analysis_query.go`.

## Authorization Notes

- Student principals are scoped to their own student-archive tutoring request metadata before repository access.
- Assigned teacher principals are scoped to assigned student IDs before repository access.
- Teaching-material request metadata is limited to teacher, admin, or service roles with `TEACHING_READ`.
- Remote/social principals remain forbidden.

## Verification

Targeted:

```text
go test ./services/teaching-archive-gateway/... PASS
```

Full:

```text
npm test PASS
npm run quality PASS
```

`reports/quality-gate.current.json`:

```json
{
  "allPassed": true,
  "elapsedMs": 141877,
  "staticChecks": {
    "passed": true,
    "findings": []
  }
}
```

No OCR, RAG, model, or training dependency was added.

## Quality Review

Clean Architecture score: 9/10.

- Domain/usecase layers still do not import HTTP, PostgreSQL, or framework packages.
- HTTP and PostgreSQL adapters translate outer formats into inner query models.
- Public behavior is contract-first through OpenAPI and SQL contract updates.
- Remaining improvement toward 10/10: future status transitions should likely become a separate worker/job use case instead of expanding the query view.

Refactoring score: 9/10.

- Applied Extract Class/File style separation by moving query behavior into `tutoring_analysis_query.go`.
- Tests were green before and after the behavior-preserving split.
- Remaining improvement toward 10/10: extract shared cursor pagination only after a third cursor-based aggregate needs it.

## Rollback

Remove SDD 0034, the list endpoint, query use case, query domain file, PostgreSQL list method and indexes, adapter tests, and structure-verifier additions. SDD 0033 creation remains intact.
