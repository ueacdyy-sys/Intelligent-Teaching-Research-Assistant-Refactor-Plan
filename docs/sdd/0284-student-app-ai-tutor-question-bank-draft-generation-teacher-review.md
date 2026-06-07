# SDD 0284 - Student App AI Tutor Question-Bank Draft Generation Teacher Review

## Problem

SDD 0283 records a sanitized generated question draft artifact, but it is still
unsafe to write that content into `teaching_question_bank_draft_contents`.
Generated content needs a human teacher/admin review boundary that approves the
draft for a later storage commit while keeping student visibility, answering,
scoring, and database writes blocked.

Without this slice, the next storage step would have no durable proof that a
teacher reviewed the generated prompts, supplied the internal scoring rubric,
confirmed age appropriateness, and accepted responsibility for content storage.

## Scope

Add a Student App AI Tutor question-bank draft generation teacher-review
runtime.

The runtime command port is
`StudentAppAITutorQuestionBankDraftGenerationTeacherReviewPort.recordGeneratedDraftTeacherReview`.

This slice:

- consumes a READY 0283 controlled-draft report;
- requires the controlled draft to remain
  `CONTROLLED_DRAFT_RECORDED_NOT_STORED`;
- requires a TEACHER or ADMIN user principal with `TEACHING_WRITE` and either
  `QUESTION_BANK_DRAFT_REVIEW` or `ADMIN_SYSTEM`;
- records
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED`;
- records `APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED`;
- records `TEACHER_REVIEW_RECORDED_NOT_STORED`;
- preserves item ID, question type, difficulty, knowledge point, hint policy,
  max hints, and source evidence refs from the controlled draft;
- allows teacher-reviewed question text, teacher-authored answer rubric, and
  teacher scoring explanation as internal future-storage evidence;
- requires a human review checklist for age appropriateness, student-own scope,
  source evidence retention, no raw model output, no model-generated answer key,
  blocked student visibility, and future storage commit;
- blocks direct `teaching_question_bank_draft_contents` writes, student
  answering, scoring, student-visible publication, direct DB access, HTTP
  execution, local tool mutation, remote device control, and Swarm.

This is not a content storage runtime, not a student publication runtime, and
not a real scoring runtime.

## Contracts

- Runtime:
  `tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-runtime.mjs`
- Runtime tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-runtime.test.mjs`
- Audit:
  `tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-audit.mjs`
- Audit tests:
  `tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-audit.test.mjs`
- Report:
  `reports/student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json`
- Source controlled-draft evidence:
  `reports/student-app-ai-tutor-question-bank-draft-generation-controlled-draft.current.json`
- Target use case:
  `ReviewQuestionBankDraftGeneratedContent.Execute`
- Future storage use case:
  `CommitReviewedQuestionBankDraftContent.Execute`
- Future storage repository:
  `ArchiveRepository.SaveQuestionBankDraftContent`
- Future storage table:
  `teaching_question_bank_draft_contents`

The append-only review log defaults to
`reports/student-command-log/student-app-ai-tutor-question-bank-draft-generation-teacher-review.jsonl`.

## Acceptance Criteria

- Runtime tests pass and cover positive teacher review approval, idempotent
  replay, conflicting replay, missing port, unsafe reviewer principal, unsafe
  source state, unsafe policy, leaked model/answer fields, unknown items,
  unsafe text, unsafe port results, missing human checklist, missing future
  storage requirement, and missing controlled draft evidence refs.
- Audit tests pass and prove the source controlled draft is READY, matched, and
  still not stored.
- `npm run audit:student-app-ai-tutor-question-bank-draft-generation-teacher-review`
  reports `READY`.
- `npm run audit:root-workflow-coverage` requires
  `studentAppAiTutorQuestionBankDraftGenerationTeacherReview`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes
  `Student App AI Tutor question-bank draft generation teacher review runtime audit`.
- The architecture board states 10.24/10 as
  `STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED`
  evidence while content storage, student answering, scoring, student-visible
  publication, complete AI Tutor productization, and public release remain
  future reviewed slices.

## Performance

This slice does not rerun `production10k` because it adds a teacher-review
control-plane evidence boundary, not a new production query implementation,
database pool tuning, worker-count change, or content write hot path. Its local
probe budget is P99 <= 50ms.

Current whole-system evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`. That evidence supports the 50ms production target
for the current durable mixed workload. It does not prove a sub-10ms production
standard, and it does not include future model inference, RAG, OCR, or full
question-bank content storage.

## Rollback

Remove the 0284 runtime, tests, audit, audit tests, report, teacher review log
output, `package.json` audit script, strict quality hook, root workflow coverage
hook, structure verifier entries, SDD, and architecture-board 10.24 text. Keep
0260-0283 intact because request, worker claim, result, generation plan,
worker precheck, worker claim, input envelope, model execution precheck, and
controlled draft slices remain valid independent evidence.
