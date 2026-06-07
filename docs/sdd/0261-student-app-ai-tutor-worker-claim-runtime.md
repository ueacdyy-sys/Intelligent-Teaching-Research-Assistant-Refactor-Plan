# SDD 0261 - Student App AI Tutor Worker Claim Runtime

## Problem

SDD 0260 proves that a student can submit an AI Tutor request from their own
archive item into `teaching_tutoring_analysis_requests`. That still leaves the
next full-system AI Tutor gap: an internal worker must be able to claim one
queued request safely, without racing another worker and without turning the
control-plane runtime into a model executor.

This slice adds the worker lease claim boundary. It is not a model inference
runtime, not a result-recording runtime, and not a question-bank draft creation
runtime. In audit wording: this is not a model inference runtime.

## Scope

Add a `Student App AI Tutor worker claim runtime`.

The command port is
`StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest`.

This slice:

- consumes an internal `StudentTutorAgent` worker claim request for
  `tutor_student`
- requires a `SERVICE` principal from `AGENT_INTERNAL`
- requires `TEACHING_WRITE`, `STUDENT_ARCHIVE_WRITE`, and
  `AGENT_COMMAND_SUBMIT` authority at the service boundary
- allows only a local worker node
- requires the queue name `student_app_ai_tutor`
- requires the queue table `teaching_tutoring_analysis_requests`
- calls only the injected use-case port backed by
  `ClaimTutoringAnalysisRequest.Execute`
- requires Go domain/use-case evidence for internal-service authorization and
  lease construction
- requires Go repository evidence that
  `ArchiveRepository.ClaimNextTutoringAnalysisRequest` claims work with
  `FOR UPDATE SKIP LOCKED`
- records an idempotent append-only worker-claim record
- returns either `STUDENT_APP_AI_TUTOR_WORKER_CLAIMED` or
  `STUDENT_APP_AI_TUTOR_WORKER_NO_CLAIM`
- records `leaseRecorded=true` only when a claim is found
- blocks immediate model execution, result recording, question-bank draft
  creation, direct database access, HTTP execution, local tool mutation, remote
  device control, and Swarm
- keeps the worker claim runtime inside a 50ms control-plane target; model work
  stays in later async slices

## Contracts

- Input schema:
  `contracts/agent/student-app-ai-tutor-worker-claim.input.schema.json`
- Output schema:
  `contracts/agent/student-app-ai-tutor-worker-claim.output.schema.json`
- Examples:
  `contracts/agent/student-app-ai-tutor-worker-claim.input.example.json` and
  `contracts/agent/student-app-ai-tutor-worker-claim.output.example.json`
- Runtime:
  `tools/student-app-ai-tutor-worker-claim-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-worker-claim-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-worker-claim-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-worker-claim-audit.test.mjs`
- Go use case evidence:
  `services/teaching-archive-gateway/internal/usecase/claim_tutoring_analysis_request.go`
  and
  `services/teaching-archive-gateway/internal/usecase/claim_tutoring_analysis_request_test.go`
- Go domain evidence:
  `services/teaching-archive-gateway/internal/domain/tutoring_analysis_claim.go`
  and
  `services/teaching-archive-gateway/internal/domain/tutoring_analysis_claim_test.go`
- Go repository evidence:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go`
  and
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only worker claim log defaults to
`reports/student-command-log/student-app-ai-tutor-worker-claim.jsonl`.

## Acceptance Criteria

- `node --test tools/student-app-ai-tutor-worker-claim-runtime.test.mjs`
  passes.
- `node --test tools/student-app-ai-tutor-worker-claim-audit.test.mjs`
  passes.
- `npm run audit:student-app-ai-tutor-worker-claim` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `studentAppAiTutorWorkerClaim`.
- `npm run verify:structure` requires this SDD, schemas, examples, runtime,
  runtime test, audit, and audit test.
- Strict quality includes `Student App AI Tutor worker claim runtime audit`.
- The architecture board states 10.1/10 current progress for worker claim while
  model inference, result recording, and question-bank draft generation remain
  later slices.

## Rollback

Remove the Student App AI Tutor worker claim schemas, examples, runtime, tests,
audit, audit tests, report, worker-claim log output, `package.json` audit
script, strict quality entry, root workflow coverage requirement,
structure-verifier entries, and architecture board text. Keep SDD 0260 and the
Go `ClaimTutoringAnalysisRequest` use case intact because request admission and
atomic worker claiming remain valid backend capabilities even without this JS
control-plane evidence slice.
