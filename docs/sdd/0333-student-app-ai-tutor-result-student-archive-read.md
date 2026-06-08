# SDD 0333: Student App AI Tutor Result Student Archive Read

## Problem

SDD 0332 proves the Student App AI Tutor result archive item exists as a
physical Teaching Archive row. The next boundary must prove the student product
can read a safe result card from that verified archive item without exposing
storage refs, raw model output, prompts, answer keys, or worker internals.

Without this slice, the chain stops at row verification. The student would have
no audited Student App read surface for the archived AI Tutor result.

## Scope

Add a product-read evidence slice:

- runtime: `verifyStudentAppAITutorResultStudentArchiveRead`
- command port:
  `StudentAppAITutorResultStudentArchiveReadPort.readStudentVisibleArchivedResult`
- report:
  `reports/student-app-ai-tutor-result-student-archive-read.current.json`
- endpoint:
  `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result`
- Go use case: `ReadStudentAppAITutorResultArchive.Execute`
- PostgreSQL snapshot repository:
  `ArchiveRepository.GetStudentAppAITutorResultArchiveSnapshot`

The runtime and Go read path must:

- require a READY 0332 row verification report
- use the authenticated own-student principal
- read through a dedicated product-read port, not JavaScript SQL or HTTP
- read only the safe snapshot table
  `teaching_ai_tutor_result_archive_snapshots`
- return a Student App result card with title, summary, guidance sections,
  safety labels, status, tags, intents, and timestamps
- support idempotent replay and reject conflicting reads
- record `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED`
- keep `contentRef`, raw `resultRef`, prompts, answer keys, raw model output,
  worker state, internal errors, direct database fields, and unsafe rendering
  out of the Student App response

## Non-Goals

This slice must not run model inference, construct prompts, call OCR/RAG,
perform Swarm orchestration, write archive data, publish new student-visible
content, expose full raw content, or complete the whole AI Tutor product. It
only proves that a previously reviewed and committed result can be read back as
a safe Student App result card.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-result-student-archive-row-verification.current.json`.
- Runtime output records
  `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED`.
- HTTP path is
  `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result`.
- Go response omits `contentRef`, `resultRef`, raw model output, prompts,
  answer keys, worker IDs, and internal errors.
- Target snapshot table is
  `teaching_ai_tutor_result_archive_snapshots`.
- Verified archive item is `tarch_student_ai_tutor_result_001`.

## Acceptance Criteria

- Runtime tests prove positive safe-card read, idempotent replay, conflicting
  replay rejection, missing port rejection, missing card rejection,
  cross-student rejection, mismatched card rejection, unsafe policy rejection,
  leaked field rejection, and missing evidence rejection.
- Go tests prove the domain builder normalizes only the safe snapshot, the use
  case rejects cross-student/method mistakes, PostgreSQL reads the safe
  projection table, and HTTP returns the card while omitting internal fields.
- Audit verifies 0332 readiness, runtime identity, injected product-read port,
  no raw DB/SQL/HTTP/model/tool/Swarm access, runtime probe under 50ms,
  negative test coverage, Go domain/usecase/HTTP/PostgreSQL/OpenAPI path,
  package script, quality gate hook, root workflow coverage hook, structure
  verifier hook, root trace row, and architecture board update.

## Performance Note

This is a control-plane/product-read boundary. It validates one READY row
verification report, calls one injected product-read port, maps one safe
snapshot to one response card, hashes the verification input, and appends one
JSONL evidence record. Runtime SLO target remains under 50ms. The whole-system
production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0
errors`; this slice does not repeat large-scale performance testing.

## Rollback

Remove the runtime/audit/test files, SDD 0333, report file, package script,
quality-gate entry, root workflow coverage hook, structure verifier entry, root
trace row, Go domain/usecase/HTTP/PostgreSQL/OpenAPI additions, schema version
7 snapshot table, and architecture-board note. Keep SDD 0320-0332 intact
because the Student App AI Tutor reviewed delivery, archive commit, and row
verification chain remains valid.
