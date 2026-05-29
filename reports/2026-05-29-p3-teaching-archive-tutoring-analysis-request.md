# P3 Teaching Archive Tutoring Analysis Request

## Slice

SDD 0033 adds a metadata-only handoff from Teaching Archive into tutoring mode:

`POST /v1/teaching/archive-items/{archiveItemId}/tutoring-analysis-requests`

This lets an authorized teacher or student queue analysis for an archive item while keeping OCR, RAG, model execution, and question generation outside the baseline runtime.

## Red Evidence

Before implementation, the new SDD 0033 tests failed as expected:

```text
go test ./services/teaching-archive-gateway/...
FAIL ita-refactor/services/teaching-archive-gateway/internal/domain [build failed]
FAIL ita-refactor/services/teaching-archive-gateway/internal/usecase [build failed]
FAIL ita-refactor/services/teaching-archive-gateway/internal/adapter/httpapi [build failed]
undefined: domain.NewTutoringAnalysisRequest
undefined: domain.CreateTutoringAnalysisRequestInput
undefined: domain.QuestionBankIntentGeneratePersonalizedCheck
undefined: usecase.NewCreateTutoringAnalysisRequest
too many arguments in call to httpapi.NewServer
```

## Implementation Evidence

- Added `TutoringAnalysisRequest` domain metadata with `QUEUED` status.
- Added `QuestionBankIntentGeneratePersonalizedCheck` as a reserved handoff signal for later personalized checks.
- Added `CreateTutoringAnalysisRequest` use case.
- Added archive-item read authorization before creating the request.
- Added HTTP subresource route under archive items.
- Added PostgreSQL metadata storage table and indexes.
- Updated OpenAPI and SQL contracts.
- Updated structure verification to require SDD 0033 and its test files.

## Test Evidence

Targeted Teaching Archive test:

```text
go test ./services/teaching-archive-gateway/...
PASS
```

Project test gate:

```text
npm test
PASS
```

Strict quality gate:

```text
npm run quality
[PASS] npm test (69909ms)
[PASS] go vet (65175ms)
[PASS] cargo test (740ms)
[PASS] identity session runtime audit (658ms)
[PASS] identity access contract audit (683ms)
[PASS] direct-limited connection budget (625ms)
[PASS] pgbouncer connection budget (600ms)
[summary] reports/quality-gate.current.json
```

Latest quality summary:

```json
{
  "allPassed": true,
  "elapsedMs": 138783,
  "staticChecks": {
    "passed": true,
    "findings": []
  }
}
```

## Dependency Boundary

Teaching Archive Go dependencies remain database/runtime only:

```text
module ita-refactor/services/teaching-archive-gateway
require github.com/jackc/pgx/v5 v5.7.6
```

No OCR, RAG, model, training, or Python worker dependency was added.

## Cleanup

`services/agent-harness/target` was removed after the quality run.
