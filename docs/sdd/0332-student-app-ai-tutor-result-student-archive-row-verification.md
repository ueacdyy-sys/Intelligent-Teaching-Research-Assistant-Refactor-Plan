# SDD 0332: Student App AI Tutor Result Student Archive Row Verification

## Problem

SDD 0331 commits a safe Student App AI Tutor result archive item through the
Teaching Archive use case port. The next boundary must prove the committed item
can be read back from the Teaching Archive repository as the same physical row.

Without this slice, the result chain would have durable storage-commit evidence,
but no audited `ArchiveRepository.GetByID` row-read proof.

## Scope

Add a runtime evidence slice:

- runtime: `verifyStudentAppAITutorResultStudentArchivePhysicalRow`
- command port:
  `StudentAppAITutorResultStudentArchiveRowVerificationPort.verifyTeachingArchivePhysicalRow`
- report:
  `reports/student-app-ai-tutor-result-student-archive-row-verification.current.json`

The runtime must:

- require a READY 0331 result archive storage commit report
- invoke only an injected `TeachingArchiveRowReadPort.getArchiveItemById`
- require source evidence from `ArchiveRepository.GetByID`
- verify the physical row exactly matches the 0331 committed archive item
- preserve the safe guidance snapshot, student scope, storage-commit metadata,
  hashes, and evidence refs
- support idempotent replay and reject conflicting row verification
- record
  `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED`
- keep raw database access, SQL, HTTP, model inference, retrieval, local tools,
  Swarm, prompts, answer keys, raw model output, `contentRef`, raw result refs,
  and internal errors out of the row-verification runtime surface

## Non-Goals

This slice must not run PostgreSQL from JavaScript, create archive items, mutate
student archive state, publish student-visible content, run models, construct
prompts, start OCR/RAG retrieval, expose raw `contentRef`, or complete the full
AI Tutor product. It verifies only the already committed Teaching Archive row.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-result-student-archive-storage-commit.current.json`.
- Runtime output records
  `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PHYSICAL_ROW_VERIFIED`.
- Row-read source is `ArchiveRepository.GetByID`.
- Target table is `teaching_archive_items`.
- Verified archive item is `tarch_student_ai_tutor_result_001`.

## Acceptance Criteria

- Runtime tests prove positive row verification, idempotent replay, conflicting
  replay rejection, missing port rejection, missing row rejection, mismatched ID
  rejection, mismatched content ref rejection, wrong owner rejection, unsafe
  policy rejection, Swarm rejection, and leaked field rejection.
- Audit verifies 0331 readiness, safe guidance preservation, runtime identity,
  injected row-read port, no raw DB/SQL/HTTP/model/retrieval/tool/Swarm, runtime
  probe under 50ms, negative test coverage, Go repository `GetByID` row-shape
  evidence, package script, quality gate hook, root workflow coverage hook,
  structure verifier hook, root trace row, and architecture board update.
- Go repository test proves `ArchiveRepository.GetByID` can scan the Student App
  AI Tutor result archive committed row shape.

## Performance Note

This is a control-plane row verification boundary. It validates one READY
storage commit, calls one injected row-read port, compares one committed archive
item to one repository row, hashes the verification input, and appends one JSONL
evidence record. Runtime SLO target remains under 50ms. The whole-system
production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0
errors`; this slice does not repeat large-scale performance testing.

## Rollback

Remove the runtime/audit/test files, SDD 0332, report file, package script,
quality-gate entry, root workflow coverage hook, structure verifier entry, root
trace row, Go repository row-shape test, and architecture-board note. Keep SDD
0320-0331 intact because the Student App delivery and storage-commit chain
remains valid.
