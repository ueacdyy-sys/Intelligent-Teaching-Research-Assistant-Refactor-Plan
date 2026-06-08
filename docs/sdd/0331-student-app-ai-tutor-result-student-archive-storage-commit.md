# SDD 0331: Student App AI Tutor Result Student Archive Storage Commit

## Problem

SDD 0330 records an append-only Student App AI Tutor result archive persistence
command, but it intentionally stops before durable student archive storage. The
next boundary must commit that reviewed command through the Teaching Archive use
case port while keeping JavaScript away from raw SQL, HTTP, model inference,
retrieval, local tools, and Swarm.

Without this boundary, the result chain would have a safe student-renderable
envelope and a reviewed persistence command, but no auditable handoff into the
student archive storage path.

## Scope

Add a runtime evidence slice:

- runtime: `commitStudentAppAITutorResultStudentArchiveStorage`
- command port: `StudentAppAITutorResultStudentArchiveStorageCommitPort.commitTeachingArchiveCreateCommand`
- report: `reports/student-app-ai-tutor-result-student-archive-storage-commit.current.json`

The runtime must:

- require a READY 0330 student archive persistence command report
- consume only `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_COMMAND`
- require a student-scoped command with `commitState=NOT_COMMITTED_TO_STUDENT_ARCHIVE`
- build a Teaching Archive create-item command for
  `CreateArchiveItem.ExecuteWithPersistence`
- invoke only an injected `TeachingArchiveCreateItemPort.createArchiveItem`
- require persisted Teaching Archive outcome evidence
- preserve safe guidance summary, sections, labels, source envelope metadata,
  request/archive IDs, hashes, and evidence refs
- support idempotent replay and reject conflicting storage commits
- record `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED`
- keep raw database access, HTTP, model inference, retrieval, tools, Swarm,
  prompt/answer-key/raw-model-output/content/result refs, and internal errors
  out of the committed record

## Non-Goals

This slice must not perform row verification, direct PostgreSQL access, HTTP
requests, model inference, OCR/RAG retrieval, prompt construction, answer-key
disclosure, question-bank draft generation, AI grading, public publication, or
complete AI Tutor product delivery. Row verification remains the next reviewed
slice.

## Contracts

- Input consumes `reports/student-app-ai-tutor-result-student-archive-persistence-command.current.json`.
- Runtime output records
  `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_STORAGE_COMMITTED`.
- Teaching Archive target use case is `CreateArchiveItem.ExecuteWithPersistence`.
- Teaching Archive target table is `teaching_archive_items`.
- Source command state moves from `NOT_COMMITTED_TO_STUDENT_ARCHIVE` to
  `COMMITTED_TO_STUDENT_ARCHIVE` in the storage-commit evidence.

## Acceptance Criteria

- Runtime tests prove positive commit, idempotent replay, conflicting replay
  rejection, missing port rejection, non-persisted port result rejection,
  invalid archive ID rejection, unsafe policy rejection, student scope mismatch
  rejection, leaked field rejection, and unsafe guidance text rejection.
- Audit verifies 0330 readiness, safe command surface, runtime identity,
  injected Teaching Archive port, no raw DB/HTTP/model/retrieval/tool/Swarm, a
  runtime probe under 50ms, negative test coverage, quality gate hook, root
  workflow coverage hook, structure verifier hook, root trace row, and
  architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

This is a control-plane storage-commit boundary. It performs in-process
validation, builds one Teaching Archive create-item command, invokes one injected
port, hashes the safe guidance payload, and appends one JSONL evidence record.
It should remain below the 50ms pass target. The current whole-system
production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0
errors`.

## Rollback

Remove the runtime/audit/test files, SDD 0331, report file, package script,
quality-gate entry, root workflow coverage hook, structure verifier entry, root
trace row, and architecture-board note. Keep SDD 0320-0330 intact because the
student delivery envelope and archive persistence command remain valid reviewed
slices.
