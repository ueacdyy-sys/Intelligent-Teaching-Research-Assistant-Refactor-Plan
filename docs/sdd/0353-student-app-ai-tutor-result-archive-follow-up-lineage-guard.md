# SDD 0353: Student App AI Tutor Result Archive Follow-up Lineage Guard

## Problem

SDD 0352 coalesces duplicate pending follow-up requests, but queue idempotency does not prove lineage for the archived result that is later shown to the student.

Without this slice, a follow-up result archive can be safe, bounded, and idempotent, but still look like an isolated card. The system must prove which prior student archive item and which controlled tutoring request produced the current AI Tutor result archive.

## Scope

This slice consumes READY SDD 0352 evidence and adds a lineage guard across safe result archive snapshot read, render, learning actions, worker input, PostgreSQL projection, HTTP responses, OpenAPI, and quality hooks.

- runtime id: `student_app_ai_tutor_result_archive_follow_up_lineage_guard`
- report: `reports/student-app-ai-tutor-result-archive-follow-up-lineage-guard.current.json`
- status: `STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_FOLLOW_UP_LINEAGE_GUARD_VERIFIED`

## Contracts

1. Require READY 0352 follow-up queue idempotency evidence.
2. Require `teaching_ai_tutor_result_archive_snapshots` to store `source_archive_item_id` and `source_tutoring_analysis_request_id`.
3. Reject safe snapshot reads when lineage is missing or points to the same archive item.
4. Preserve lineage through `StudentAppAITutorResultArchiveCard`, safe render envelope, learning actions, and worker-only result-archive input.
5. Expose only `sourceArchiveItemId` to Student App read/render/action responses.
6. Keep `sourceTutoringRequestId` internal and blocked from Student App responses.
7. Expose `resultArchiveSourceItemId` only to the worker-only AI Tutor input response.
8. Keep the slice outside model inference, OCR/RAG, Swarm, tool execution, and direct JavaScript database access.

## Safety Invariants

- A result archive cannot be read as student-visible AI Tutor guidance without lineage.
- Follow-up result archives must have a parent item different from the current archive item.
- Student App responses do not expose internal tutoring request ids.
- Worker-only input receives enough lineage to continue controlled model/precheck/archive paths.
- Existing depth and idempotency guards remain intact.

## Acceptance Criteria

- `node tools/student-app-ai-tutor-result-archive-follow-up-lineage-guard-audit.mjs`
- Go domain/usecase/postgres/httpapi tests cover lineage propagation and rejection of missing/self lineage.
- OpenAPI documents the safe public lineage field and worker-only lineage field.
- `npm run verify:structure`, `npm run test:tools`, and `npm run quality` include this slice.

## Rollback

Remove this SDD, the 0353 audit/test/report, the lineage fields and projection columns, the `sourceArchiveItemId`/`resultArchiveSourceItemId` response contract changes, and the 0353 hook entries from package scripts, quality gate, root workflow coverage, structure verification, root trace, and architecture board. SDD 0352 idempotency remains intact, but follow-up archived results would no longer prove parent lineage.
