# SDD 0260 - Student App AI Tutor Request Runtime

## Problem

The Student App root requirement includes an AI tutoring assistant, student
archives, teaching materials, personalized question banks, and scan-to-answer
flows. Current evidence already proves a read-only `recommend_practice` fast
path, but that is not enough for the full AI Tutor loop: the student still
needs a controlled way to queue tutoring analysis from their own archive item.

This slice adds that queue-admission boundary. It is not a model inference
runtime, not a final evaluation path, and not a direct database/HTTP executor.
In audit wording: this is not a model inference runtime.

## Scope

Add a `Student App AI Tutor request runtime`.

The command port is
`StudentAppAITutorRequestPort.createStudentAppAITutorRequest`.

This slice:

- consumes a Student App `tutor_student` request from a `STUDENT` principal
- requires `STUDENT_APP`, `TEACHING_READ`, `STUDENT_OWN_READ`, and own student
  archive scope
- requires a `tarch_` archive item and `STUDENT` source owner expectation
- routes only to `StudentTutorAgent` through `SINGLE_WORKER`
- calls only the injected use-case port backed by
  `CreateStudentAppAITutorRequest.Execute`
- requires Go evidence that the use case reads the archive item through
  `ArchiveRepository.GetByID`
- requires Go evidence that the queued job is inserted through
  `ArchiveRepository.CreateTutoringAnalysisRequest` into
  `teaching_tutoring_analysis_requests`
- returns a `tutor_req_` queued request
- keeps `questionBankDraftDeferred=true`
- keeps `asyncAnalysisRequired=true`
- blocks direct database access, HTTP execution, immediate model calls, final
  evaluation, local tool mutation, remote device control, and Swarm
- keeps the admission runtime inside a 50ms target; model work stays async

## Contracts

- Input schema:
  `contracts/agent/student-app-ai-tutor-request.input.schema.json`
- Output schema:
  `contracts/agent/student-app-ai-tutor-request.output.schema.json`
- Examples:
  `contracts/agent/student-app-ai-tutor-request.input.example.json` and
  `contracts/agent/student-app-ai-tutor-request.output.example.json`
- Runtime:
  `tools/student-app-ai-tutor-request-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-request-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-request-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-request-audit.test.mjs`
- Go use case evidence:
  `services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go`
  and
  `services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go`
- Go repository evidence:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go`
  and
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_student_app_request_test.go`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only queue admission log defaults to
`reports/student-command-log/student-app-ai-tutor-request.jsonl`.

## Acceptance Criteria

- `node --test tools/student-app-ai-tutor-request-runtime.test.mjs` passes.
- `go test ./services/teaching-archive-gateway/internal/adapter/postgres -run TestCreateStudentAppAITutorRequestInsertsQueuedStudentArchiveJob -count=1`
  passes.
- `node --test tools/student-app-ai-tutor-request-audit.test.mjs` passes.
- `npm run audit:student-app-ai-tutor-request` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `studentAppAiTutorRequest`.
- `npm run verify:structure` requires this SDD, schemas, examples, runtime,
  runtime test, audit, audit test, and Go repository evidence test.
- Strict quality includes `Student App AI Tutor request runtime audit`.
- The architecture board states that Student App AI Tutor request admission is
  current progress while worker claim/result review/question-bank draft remain
  later slices.

## Rollback

Remove the Student App AI Tutor request schemas, examples, runtime, tests,
audit, audit tests, report, queue-admission log output, Go repository evidence
test, `package.json` audit script, strict quality entry, root workflow coverage
requirement, structure-verifier entries, and architecture board text. Keep the
existing StudentTutor read-only adapter and the Go
`CreateStudentAppAITutorRequest` use case intact because they remain valid
without this runtime evidence slice.
