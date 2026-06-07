# SDD 0286 - Student App AI Tutor Question-Bank Draft Generation Content Row Verification

## Problem

SDD 0285 commits teacher-reviewed generated question-bank draft content through
the Teaching Archive storage port. The system still needs a separate evidence
slice that proves the committed `teaching_question_bank_draft_contents` row can
be read back through the scoped repository boundary before claiming durable row
verification.

## Scope

This slice verifies the physical content row after 0285. It consumes the 0285
READY report and calls only an injected row read port:
`QuestionBankDraftContentRowReadPort.getQuestionBankDraftContentForStudent`.

It verifies:

- source report is 0285 content storage commit READY;
- target repository is `ArchiveRepository.GetQuestionBankDraftContentForStudent`;
- target table is `teaching_question_bank_draft_contents`;
- lookup is scoped by `questionBankDraftRef` plus `studentId`;
- row linkage matches the committed draft ref, request id, archive item id,
  student id, material, result summary, and item count;
- safe student preview still excludes `expectedAnswer` and `explanation`;
- internal scoring material is present but not disclosed by this runtime.

Out of scope:

- Student App read verification;
- answering;
- scoring;
- feedback publication;
- model inference;
- direct database/SQL access from JS;
- HTTP execution;
- local tool mutation;
- Swarm.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-content-row-verification.current.json`
- Source report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.current.json`

Runtime status:

- `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTENT_PHYSICAL_ROW_VERIFIED`

Root workflow key:

- `studentAppAiTutorQuestionBankDraftGenerationContentRowVerification`

## Acceptance Criteria

- 0285 report is READY and has `questionBankContentWriteCommitted=true`.
- 0286 runtime calls exactly the injected scoped row read port in tests and audit
  probe.
- Runtime records `physicalDatabaseRowVerified=true`.
- Runtime output does not include `expectedAnswer` or `explanation` in the
  student preview.
- Runtime keeps student read verification, answering, scoring, publication, and
  model inference future-gated.
- Audit is included in `package.json`, `tools/quality-gate.mjs`,
  `tools/root-workflow-coverage-audit.mjs`, `tools/verify-structure.mjs`, and
  `architecture-board.html`.
- Local verification commands pass:
  - `node --test tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.test.mjs tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.test.mjs`
  - `npm run audit:student-app-ai-tutor-question-bank-draft-generation-content-row-verification`
  - `npm run verify:structure`
  - `npm run audit:root-workflow-coverage`

## Rollback

Remove the 0286 runtime, tests, audit, audit tests, report, SDD, command-log
records, quality-gate entry, root workflow coverage references, structure
verifier entries, and architecture-board 10.26 references. Keep 0285 content
storage commit evidence intact.
