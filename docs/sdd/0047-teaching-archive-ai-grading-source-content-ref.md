# SDD 0047: Teaching Archive AI Grading Source Content Ref

## Problem

The AI grading flow can queue, list, claim, and complete metadata-only grading requests, but the queued request does not carry the source archive `contentRef`. A worker claim currently includes grading instructions, rubric reference, source material type, and OCR status, yet it lacks the stable pointer to the quiz, paper, or homework artifact that must be graded.

This makes the worker boundary less useful than the root requirement needs: Teaching Mode keeps AI grading, reserves OCR or handwriting recognition for precise scoring, and the whole-system map says Python AI workers should work behind job APIs instead of polling archive rows directly. The job payload must therefore include the source artifact reference while keeping file content and OCR/model dependencies outside the baseline gateway.

## Source Requirement References

- Root requirement: AI grading keeps existing functionality while reserving OCR or handwriting recognition for accurate scoring.
- Root requirement: archive materials include student quizzes, papers, guide sheets, homework, and teaching materials.
- Whole-system map: Teaching Mode owns quiz, AI grading, archives, and worker handoff APIs.
- Whole-system map: AI Workers are Python behind a Job API and must not directly poll or write the main database.
- SDD 0038-0044: AI grading request, query, worker claim, and result flow already exist.

## Scope

In scope:

- Persist the source archive `contentRef` on every AI grading request.
- Include `sourceArchiveContentRef` in AI grading request list/create responses.
- Include `sourceArchiveContentRef` in worker claim responses.
- Keep the field metadata-only: it is a reference string, not file content.
- Backfill compatibility through idempotent schema migration for existing deployments.

Out of scope:

- Reading source files.
- OCR or handwriting recognition.
- Model scoring or rubric execution.
- Quiz submission-to-grading bridge.
- Worker implementation changes outside the contract payload.
- TypeScript SDK generation.

## Contracts

Updated contracts:

- `contracts/openapi/teaching-archive.yaml`
- `contracts/openapi/teaching-archive.ai-grading-worker-claims.path.yaml`
- `contracts/sql/teaching-archive.sql`

Go service:

- `services/teaching-archive-gateway`
- Domain: `AIGradingRequest.SourceArchiveContentRef`
- Use case: `CreateAIGradingRequest` copies `ArchiveItem.ContentRef`

PostgreSQL adapter:

- Add `source_archive_content_ref` to `teaching_ai_grading_requests`.
- Insert/select/scan the field with existing request metadata.

## Acceptance Criteria

- Domain tests prove AI grading requests normalize and retain source archive content ref.
- Domain tests reject eligible-looking grading requests without source content ref.
- Use-case tests prove source archive content ref is copied from the archive item before insert.
- HTTP tests prove create/list/worker-claim responses include `sourceArchiveContentRef`.
- PostgreSQL adapter tests prove insert/select include `source_archive_content_ref`.
- Structure verification requires SDD 0047 and heading coverage.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Remove SDD 0047, remove `sourceArchiveContentRef` from OpenAPI responses, remove the Go field and mappings, remove SQL `source_archive_content_ref` column/index references, and remove related tests. Existing AI grading queue/claim/result behavior remains otherwise intact.

## Observability And Performance Evidence

Record:

- failing test evidence before implementation.
- targeted Teaching Archive Go test result after implementation.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
