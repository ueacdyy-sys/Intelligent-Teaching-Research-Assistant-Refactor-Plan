# P4 Student App Contract Flow Gate

## Slice

- SDD: `docs/sdd/0068-student-app-contract-flow-gate.md`
- Root requirement anchor: Student App includes account login, AI tutor, student archive, teaching materials, personalized question bank, and scan-to-answer.
- Existing refactor evidence: SDD 0060 through SDD 0067 added the Student App mobile-facing Identity Access and Teaching Archive contracts.

## Contract

- Added `tools/student-app-flow-audit.mjs`.
- Added `tools/student-app-flow-audit.test.mjs`.
- Added `npm run audit:student-app-flow`.
- Added the Student App flow audit to `npm run quality`.
- Added structure verification coverage for SDD 0068 and the new audit files.

The audit checks:

- `POST /v1/identity/sessions/password` exists for Student App login.
- `GET /v1/student-app/profile` exists and requires `BearerAuth`.
- `StudentAppProfileResponse` exposes stable mobile identifiers.
- Student App profile does not leak `scopes`, `knowledgeAccess`, or `studentAccess`.
- Teaching Archive exposes Student App paths for teaching materials, archive items, AI tutor requests, quiz submissions, quiz scan submissions, and question-bank drafts.
- Each Teaching Archive Student App path keeps Agent API key and Principal Context security.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing file:

- `tools/student-app-flow-audit.mjs`

`node --test tools\student-app-flow-audit.test.mjs` failed before implementation with:

- `ERR_MODULE_NOT_FOUND` for `tools/student-app-flow-audit.mjs`

## Green Evidence

- `npm run verify:structure`: PASS
- `node --test tools\student-app-flow-audit.test.mjs`: PASS
- `node --test tools\quality-gate.test.mjs`: PASS
- `npm test`: PASS
- `npm run quality`: PASS, 14.9s
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/student-app-flow.current.json`:

- readiness: `READY`
- all Student App login, profile, Teaching Archive path, and security findings: PASS

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `14892`
- npm test: PASS, 7670ms
- go vet: PASS, 1085ms
- cargo test: PASS, 1178ms
- identity session runtime audit: PASS, 887ms
- identity access contract audit: PASS, 961ms
- student app flow audit: PASS, 858ms
- direct-limited connection budget: PASS, 802ms
- pgbouncer connection budget: PASS, 876ms

## Design Notes

- This is an executable contract-flow gate, not a new runtime feature.
- The gate protects the current Student App contract set from accidental removal during later vibecoding slices.
- The profile leak check is intentionally focused on internal authorization fields that should not become mobile read-model output.
- No SQL table, package dependency, OCR/RAG/model, or training dependency was added.
