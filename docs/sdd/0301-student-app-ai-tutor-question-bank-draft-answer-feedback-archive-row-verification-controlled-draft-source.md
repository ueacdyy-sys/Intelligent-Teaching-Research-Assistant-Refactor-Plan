# SDD 0301 - Student App AI Tutor Question-Bank Draft Answer Feedback Archive Row Verification Controlled Draft Source

## Problem

SDD 0300 commits the Student App AI Tutor feedback archive item through the
controlled draft source chain, but a durable commit alone is not enough
evidence for the immutable root requirements. The system also needs to prove
that the committed Teaching Archive item can be read back as a physical row
with the exact same safe feedback shape.

The verification must consume the 0300 controlled-source storage commit, not
the legacy 0276 commit and not a delivery envelope. It must verify by an
injected repository read port instead of letting JavaScript execute SQL.

## Scope

Add an auditable Student App feedback archive row verification runtime that
consumes the READY 0300 archive storage commit controlled draft source report.

The runtime consumes:

- the READY 0300 controlled-source archive storage commit report;
- preserved sourcePublicationApproval and sourceControlledFeedbackDraft
  evidence;
- the committed Teaching Archive item and its safe learner feedback snapshot;
- an injected Teaching Archive row read port;
- a verification policy that permits only the injected row read.

The runtime records
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_PHYSICAL_ROW_VERIFIED_FROM_CONTROLLED_DRAFT_SOURCE`
after `TeachingArchiveRowReadPort.getArchiveItemById` returns a row that
matches the committed archive item.

This slice intentionally does not expose an HTTP endpoint, run SQL from
JavaScript, write the database, call a model, remote-control devices, mutate
local tools, enable Swarm, or publish student-visible content directly.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json`
- Repository evidence:
  `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go`

## Acceptance Criteria

- The runtime requires READY 0300 controlled-source archive storage commit
  evidence.
- The source commit must be
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE`.
- The runtime invokes exactly one injected
  `TeachingArchiveRowReadPort.getArchiveItemById` call.
- The row read source must identify `ArchiveRepository.GetByID` and
  `teaching_archive_items`.
- The row must match the committed archive item by id, ownerType, studentId,
  materialType, title, source, contentRef, tags, analysisIntents, ocrStatus,
  and createdAt.
- The runtime preserves sourcePublicationApproval, sourceControlledFeedbackDraft,
  sourcePersistenceCommand, scoreSummary, learnerFeedback, and source controlled
  draft evidence.
- The runtime proves `storageCommitControlledDraftSourceVerified`,
  `controlledDraftSourceVerified`, `sourceControlledDraftEvidencePreserved`,
  `teachingArchiveRepositoryGetByIDUsed`, `mainDatabaseReadAllowed`, and
  `physicalDatabaseRowVerified`.
- The runtime remains idempotent by idempotency key and rejects conflicting
  replay.
- The runtime rejects answer text, answer keys, expected answers, explanations,
  result refs, worker/claim fields, raw model output, database result leakage,
  internal errors, unsafe feedback text, raw DB/SQL, HTTP execution, model
  inference, device control, local tool mutation, and Swarm.
- The Go repository test accepts the controlled-source Student App feedback
  archive physical row shape.
- The audit proves package scripts, strict quality, root workflow coverage,
  structure verification, SDD, and architecture board track 0301.

## Performance

This is a row verification control-plane slice that uses an injected repository
read boundary. It does not change worker count, database pool configuration,
PgBouncer configuration, or the production mixed workload hot path. It is held
to P99 <= 50ms for the local runtime probe. Current whole-system evidence
remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; no new
`production10k` run is required for this slice.

## Rollback

Remove the 0301 runtime, runtime tests, audit, audit tests, report, package
script, strict quality hook, root workflow coverage hook, structure verifier
entries, SDD, architecture-board 10.41 text, and the controlled-source
repository row shape test. Keep 0295-0300 and legacy 0275-0277 intact because
controlled draft generation, source review, source approval, controlled-source
delivery, controlled-source command recording, and controlled-source storage
commit remain valid independent slices.
