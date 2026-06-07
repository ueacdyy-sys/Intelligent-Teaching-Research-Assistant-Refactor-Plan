# SDD 0300 - Student App AI Tutor Question-Bank Draft Answer Feedback Archive Storage Commit Controlled Draft Source

## Problem

SDD 0299 records an append-only Student App feedback archive persistence
command from the controlled draft source chain, but it intentionally stops
before durable storage. The next product gap is a storage commit that consumes
that 0299 command instead of the legacy 0275 command or a delivery envelope.

The immutable root requirements require student archive evidence, but the
archive write must remain behind reviewed, auditable, controlled-source
boundaries. This slice therefore commits through an injected Teaching Archive
use case port and keeps raw JavaScript database access, HTTP, model execution,
tool control, and Swarm outside the runtime.

## Scope

Add an auditable Student App feedback archive storage commit runtime that
consumes the READY 0299 archive persistence command controlled draft source
report.

The runtime consumes:

- the READY 0299 controlled-source archive persistence command report;
- preserved sourcePublicationApproval and sourceControlledFeedbackDraft
  evidence;
- the safe scoreSummary and learnerFeedback payload from the controlled
  feedback draft chain;
- an injected Teaching Archive create-item use case port;
- a commit policy that permits only the injected use case write.

The runtime commits
`STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_FEEDBACK_ARCHIVE_STORAGE_COMMITTED_FROM_CONTROLLED_DRAFT_SOURCE`
and records evidence that `CreateArchiveItem.ExecuteWithPersistence` persisted
the Teaching Archive item.

This slice intentionally does not expose an HTTP endpoint, run SQL from
JavaScript, call a model, remote-control devices, mutate local tools, enable
Swarm, or publish student-visible content directly.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.current.json`
- Source evidence:
  `reports/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.current.json`
- Teaching Archive use case:
  `services/teaching-archive-gateway/internal/usecase/create_archive_item.go`

## Acceptance Criteria

- The runtime requires READY 0299 controlled-source archive persistence command
  evidence.
- The runtime requires the source command to be recorded but not committed:
  `PERSISTENCE_COMMAND_FROM_CONTROLLED_DRAFT_SOURCE_RECORDED_NOT_COMMITTED`.
- The runtime invokes exactly one injected
  `TeachingArchiveCreateItemPort.createArchiveItem` call.
- The port target remains the Go Teaching Archive use case boundary:
  `CreateArchiveItem.ExecuteWithPersistence`.
- The committed archive item must preserve submissionId, requestId,
  questionBankDraftRef, tutoringAnalysisRequestId, archiveItemId, scopeRef,
  sourceControlledDraftArtifactId, approvedFeedbackArtifactId,
  deliveryEnvelopeId, approvalId, scoreSummary, and learnerFeedback.
- The runtime proves `archivePersistenceCommandControlledDraftSourceVerified`,
  `controlledDraftSourceVerified`, `sourceControlledDraftEvidencePreserved`,
  `safeLearnerFeedbackOnly`, `mainDatabaseWriteCommitted`, and
  `studentArchivePersisted`.
- The runtime remains idempotent by idempotency key and rejects conflicting
  replay.
- The runtime rejects answer text, answer keys, expected answers, explanations,
  result refs, worker/claim fields, raw model output, database result leakage,
  internal errors, unsafe feedback text, raw DB/SQL, HTTP execution, model
  inference, device control, local tool mutation, and Swarm.
- The Go use case test accepts the controlled-source Student App feedback
  archive storage commit shape.
- The audit proves package scripts, strict quality, root workflow coverage,
  structure verification, SDD, and architecture board track 0300.

## Performance

This is a durable commit control-plane slice that uses the already isolated
Teaching Archive write boundary. It does not change worker count, database pool
configuration, PgBouncer configuration, or the production mixed workload hot
path. It is held to P99 <= 50ms for the local runtime probe. Current
whole-system evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`,
`0 errors`; no new `production10k` run is required for this slice.

## Rollback

Remove the 0300 runtime, runtime tests, audit, audit tests, report, package
script, strict quality hook, root workflow coverage hook, structure verifier
entries, SDD, and architecture-board 10.40 text. Keep 0295-0299 and legacy
0275-0277 intact because controlled draft generation, source review, source
approval, controlled-source delivery, controlled-source command recording, and
legacy archive storage remain valid independent slices until row verification
consumes 0300.
