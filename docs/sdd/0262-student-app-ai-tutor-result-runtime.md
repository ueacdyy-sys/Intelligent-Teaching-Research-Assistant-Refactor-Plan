# SDD 0262 - Student App AI Tutor Result Runtime

## Problem

SDD 0260 admits a student AI Tutor request into
`teaching_tutoring_analysis_requests`. SDD 0261 lets an internal
`StudentTutorAgent` worker claim one queued request with a lease. The next
full-system gap is controlled result recording: after the worker has already
produced a bounded analysis result, the system must persist that result without
letting the JavaScript control-plane runtime execute models, generate question
bank drafts, publish student-visible answers, or bypass Go domain rules.

This slice adds the result-recording boundary. It is not a model inference
runtime, not a question-bank draft creation runtime, and not a student-visible
delivery runtime. In audit wording: this is not a model inference runtime.

## Scope

Add a `Student App AI Tutor result runtime`.

The command port is
`StudentAppAITutorResultPort.recordTutoringAnalysisResult`.

This slice:

- consumes the result of a previously claimed `StudentTutorAgent` worker lease
- requires a `SERVICE` principal from `AGENT_INTERNAL`
- requires `TEACHING_WRITE` authority at the service boundary
- allows only a local `StudentTutorAgent` worker for `tutor_student`
- requires the claimed request to be `IN_PROGRESS`
- requires the claim worker to match the result worker
- audit invariant: worker lease must match
- supports `SUCCEEDED` and `FAILED` tutoring analysis results
- records `questionBankDraftRef` only as metadata already returned by the
  downstream worker/use case; it does not create the draft
- calls only the injected use-case port backed by
  `RecordTutoringAnalysisResult.Execute`
- requires Go domain/use-case evidence for `ApplyTutoringAnalysisResult`,
  `AuthorizeRecordTutoringAnalysisResult`, and worker lease matching
- requires Go repository evidence that
  `ArchiveRepository.RecordTutoringAnalysisResult` updates
  `teaching_tutoring_analysis_requests` only when `claimed_by_worker_id` still
  matches and `claim_expires_at` is still valid
- records an idempotent append-only result record
- returns `STUDENT_APP_AI_TUTOR_RESULT_RECORDED`
- blocks inline model execution, question-bank draft creation,
  student-visible publication, direct database access, HTTP execution, local
  tool mutation, remote device control, and Swarm
- keeps the result-recording control plane inside a 50ms target; model work
  remains an async worker concern

## Contracts

- Input schema:
  `contracts/agent/student-app-ai-tutor-result.input.schema.json`
- Output schema:
  `contracts/agent/student-app-ai-tutor-result.output.schema.json`
- Examples:
  `contracts/agent/student-app-ai-tutor-result.input.example.json` and
  `contracts/agent/student-app-ai-tutor-result.output.example.json`
- Runtime:
  `tools/student-app-ai-tutor-result-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-result-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-result-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-result-audit.test.mjs`
- Go use case evidence:
  `services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result.go`
  and
  `services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result_test.go`
- Go domain evidence:
  `services/teaching-archive-gateway/internal/domain/tutoring_analysis_result.go`
  and
  `services/teaching-archive-gateway/internal/domain/tutoring_analysis_request_test.go`
- Go repository evidence:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go`
- HTTP evidence:
  `services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only result log defaults to
`reports/student-command-log/student-app-ai-tutor-result.jsonl`.

## Acceptance Criteria

- `node --test tools/student-app-ai-tutor-result-runtime.test.mjs` passes.
- `node --test tools/student-app-ai-tutor-result-audit.test.mjs` passes.
- `npm run audit:student-app-ai-tutor-result` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `studentAppAiTutorResult`.
- `npm run verify:structure` requires this SDD, schemas, examples, runtime,
  runtime test, audit, and audit test.
- Strict quality includes `Student App AI Tutor result runtime audit`.
- The architecture board states 10.2/10 current progress for AI Tutor result
  recording while question-bank draft generation, student-visible delivery,
  true model inference, and full AI Tutor product completion remain later
  reviewed slices.

## Rollback

Remove the Student App AI Tutor result schemas, examples, runtime, tests,
audit, audit tests, report, result log output, `package.json` audit script,
strict quality entry, root workflow coverage requirement, structure-verifier
entries, and architecture board text. Keep SDD 0260, SDD 0261, and the Go
`RecordTutoringAnalysisResult` use case intact because request admission,
worker claiming, and guarded result persistence remain valid backend
capabilities even without this JS control-plane evidence slice.
