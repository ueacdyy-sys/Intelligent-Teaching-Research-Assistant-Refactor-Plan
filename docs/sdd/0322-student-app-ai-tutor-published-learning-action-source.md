# SDD 0322: Student App AI Tutor Published Learning Action Source

## Problem

SDD 0321 exposes safe learning action affordances for a READY Student App study packet. The target endpoint already exists as `POST /v1/student-app/ai-tutor-requests`, but the existing request path only proves a generic own-student archive item through `GetByID`.

For the material detail page to become a safe product loop, a request created from a 0321 action must prove that it came from the same published, student-visible, SAFE_TEXT_BLOCKS study packet boundary before it enters the AI Tutor queue.

## Scope

Extend `POST /v1/student-app/ai-tutor-requests` with an optional `learningActionSource` object:

- `actionType`: `AI_TUTOR_REQUEST` or `PERSONALIZED_QUESTION_BANK`
- `packetStatus`: `READY`

When `learningActionSource` is present, `CreateStudentAppAITutorRequest.Execute` must:

- normalize the Student App own-student principal and archive item id
- read published metadata through `ArchiveRepository.GetPublishedForStudentApp`
- read safe preview metadata through `ArchiveRepository.GetPublishedContentPreviewForStudentApp`
- rebuild the 0320 READY study packet boundary
- rebuild the 0321 learning actions boundary
- allow queue creation only when the requested action type and `questionBankIntent` match an available action
- write only the existing `TutoringAnalysisRequest` queue row

The old request form without `learningActionSource` remains compatible and still uses the generic own-student archive path.

## Contracts

- `learningActionSource.packetStatus` must be `READY`.
- `learningActionSource.actionType` must be a 0321 action type.
- Source validation must use published Student App reads, not generic `GetByID`.
- Metadata and preview must match `archiveItemId`, `materialType`, and `title`.
- Response remains `TutoringAnalysisRequestResponse`; it must not echo `learningActionSource`.
- Response must not expose preview content, `contentRef`, prompt text, OCR/RAG chunks, answer keys, model output, worker state, publication metadata, approval metadata, or internal errors.
- This slice must not run model inference, generate a question bank, create feedback, do semantic retrieval, invoke Swarm, or add a new production10k benchmark.

## Acceptance Criteria

- Domain tests prove valid learning action source normalization and invalid source rejection.
- Use case tests prove sourced requests use published detail + safe preview reads and do not call generic `GetByID`.
- HTTP tests prove `POST /v1/student-app/ai-tutor-requests` accepts `learningActionSource` and still returns only safe queue metadata.
- OpenAPI documents `StudentAppAITutorLearningActionSource`.
- Audit verifies 0321 readiness, Go source/usecase/HTTP/OpenAPI wiring, response non-leakage, quality gate hook, root workflow coverage, structure verifier, root trace, and architecture board updates.
- Runtime SLO remains under 50ms. This is a queue-admission composition and does not change the current whole-system production10k claim.

## Performance Note

The sourced path adds two indexed reads already used by the 0320/0321 Student App material detail path, followed by in-process boundary checks and a single existing queue write. It is expected to remain below the 50ms target; the current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove `learningActionSource` from the request contract, domain normalization, use case source path, HTTP request mapping and tests, SDD 0322, audit/report files, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0321 learning actions and the old AI Tutor request path intact.
