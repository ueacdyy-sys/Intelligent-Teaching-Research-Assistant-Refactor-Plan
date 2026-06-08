# SDD 0323: Student App AI Tutor Worker Study Packet Input

## Problem

SDD 0322 proves a published Student App learning action before a tutor request enters the queue. The next unsafe boundary is worker input construction: an internal StudentTutorAgent worker must not build model input directly from `contentRef`, raw OCR text, generic archive reads, or unverified request metadata.

Before future model execution, the worker needs a claimed-request input package that reuses the same published Student App detail and SAFE_TEXT_BLOCKS study packet boundary while proving the worker owns the active claim lease.

## Scope

Add a worker-only read path for claimed Student App AI Tutor requests:

- `POST /v1/teaching/tutoring-analysis-requests/{requestId}/ai-tutor-study-packet-input`
- request body: `{ "workerId": "..." }`
- use case: `ReadAITutorWorkerStudyPacketInput.Execute`

The use case must:

- require `SERVICE + AGENT_INTERNAL + TEACHING_WRITE`
- normalize `tutor_req_` request id and worker id
- read the existing `TutoringAnalysisRequest` by id
- require `IN_PROGRESS`, matching `claimedByWorkerId`, and non-expired claim lease
- require a student-owned source archive with `sourceArchiveStudentId`
- read published metadata through `GetPublishedForStudentApp`
- read safe preview metadata through `GetPublishedContentPreviewForStudentApp`
- rebuild the 0320 READY study packet boundary
- rebuild the 0321 learning-actions boundary and require a matching `questionBankIntent`
- return only queue metadata and SAFE_TEXT_BLOCKS blocks for worker input

## Non-Goals

This slice must not run model inference, generate a question bank, generate feedback, write a tutoring result, write question-bank draft content, invoke Swarm, do semantic retrieval, expose raw content, expose `contentRef`, or add a new production10k benchmark.

## Contracts

- The endpoint is internal worker-only and uses the existing agent API key plus principal context.
- Response must include `requestId`, `archiveItemId`, `analysisGoal`, `questionBankIntent`, `status`, `workerId`, `claimExpiresAt`, `sourceArchiveStudentId`, `sourceArchiveMaterial`, `packetStatus`, `renderFormat`, and SAFE_TEXT_BLOCKS `blocks`.
- Response must not include `contentRef`, `contentPreview`, `rawContent`, prompt text, OCR/RAG chunks, answer keys, result refs, model output, publication approval fields, or internal error details.
- The old worker claim and worker result endpoints remain unchanged.

## Acceptance Criteria

- Domain tests prove claimed worker input validates request id, worker lease, student source, READY packet, learning action, and rejects wrong workers.
- Use case tests prove the worker input path reads the tutoring request, published detail, and safe preview; it must not use generic archive `GetByID`.
- HTTP tests prove the internal endpoint returns only worker-safe study packet input and rejects non-service principals.
- OpenAPI documents the new path and response contract.
- Audit verifies SDD 0322 readiness, Go/usecase/HTTP/OpenAPI wiring, response non-leakage, quality gate hook, root workflow coverage, structure verifier, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

The path adds one request lookup plus the same two indexed published Student App reads already used by 0320-0322, followed by in-process validation. It is expected to stay under the 50ms control-plane target. The current whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the worker input domain/use case/HTTP/OpenAPI files and tests, SDD 0323, audit/report files, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0320-0322 and the existing tutoring worker claim/result endpoints intact.
