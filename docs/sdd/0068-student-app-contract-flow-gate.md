# SDD 0068: Student App Contract Flow Gate

## Problem

The root requirement says the Student App must support account login, AI tutor,
student archive, teaching materials, personalized question bank, and
scan-to-answer. SDD 0060 through SDD 0067 now add those contracts across
Identity Access and Teaching Archive, but the project still lacks a single
executable gate proving the mobile-facing contract flow stays intact.

Without a flow gate, future vibecoding slices can accidentally remove a Student
App path, leak the full `PrincipalContext` into the mobile profile read model,
or leave scan-answer outside the Student App namespace while individual endpoint
tests still pass.

## Source Requirement References

- Root requirement: Student App includes account login, AI tutor, student
  archive, teaching materials, personalized question bank, and scan-to-answer.
- Whole system module map: Student App done evidence includes a mobile flow
  test and privacy-policy-style evidence.
- SDD 0060 through SDD 0067: Student App mobile contracts and profile read
  model.

## Scope

In scope:

- Add an executable Student App contract flow audit.
- Verify Identity Access exposes password login and Student App profile.
- Verify Student App profile uses Bearer auth and does not expose `scopes`,
  `knowledgeAccess`, or `studentAccess`.
- Verify Teaching Archive exposes the Student App paths for teaching materials,
  archive items, AI tutor requests, quiz submissions, quiz scan submissions, and
  question-bank drafts.
- Verify Student App Teaching Archive path files keep Agent API key and
  Principal Context security.
- Add the audit to the strict quality gate.

Out of scope:

- Starting live services.
- Generating a TypeScript SDK.
- Mobile UI automation.
- OCR/RAG/model/training execution.
- Changing endpoint behavior.

## Contracts

New tooling:

- `tools/student-app-flow-audit.mjs`
- `tools/student-app-flow-audit.test.mjs`
- `reports/student-app-flow.current.json`

Updated gates:

- `package.json`
- `tools/quality-gate.mjs`
- `tools/verify-structure.mjs`

## Acceptance Criteria

- `node --test tools/student-app-flow-audit.test.mjs` passes.
- The audit fails when `/v1/student-app/profile` is removed.
- The audit fails when the Student App profile response leaks internal
  authorization fields.
- The audit fails when `/v1/student-app/quiz-scan-submissions` is removed.
- `npm run quality` runs the Student App flow audit and writes
  `reports/student-app-flow.current.json`.
- No package, SQL, OCR/RAG/model, or training dependency is added.

## Rollback

Remove SDD 0068, the Student App flow audit tool and tests, the package script,
the quality-gate command entry, the generated current report, and the structure
verifier entries. Existing Identity and Teaching Archive contracts remain
unchanged.

## Observability And Performance Evidence

Record:

- failing structure and tool-test evidence before implementation.
- `node --test tools/student-app-flow-audit.test.mjs` after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json`
  summary.
- `reports/student-app-flow.current.json` readiness summary.
- confirmation that no SQL table, package, OCR/RAG/model, or training dependency
  was added.
