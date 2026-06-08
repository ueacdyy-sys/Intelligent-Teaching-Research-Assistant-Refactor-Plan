# SDD 0334: Student App AI Tutor Result Student Archive Render

## Problem

SDD 0333 proves the Student App can read a safe archived AI Tutor result card.
The product still needs a dedicated render envelope so the UI can display the
result as safe text blocks without inventing HTML, Markdown, raw model output,
storage refs, prompts, answer keys, or worker internals.

Without this slice, the student-facing chain stops at a data card. The UI would
have no audited render contract for showing the archived AI Tutor result.

## Scope

Add a product-render evidence slice:

- runtime: `verifyStudentAppAITutorResultStudentArchiveRender`
- command port:
  `StudentAppAITutorResultStudentArchiveRenderPort.renderStudentVisibleArchivedResult`
- report:
  `reports/student-app-ai-tutor-result-student-archive-render.current.json`
- endpoint:
  `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered`
- Go use case: `RenderStudentAppAITutorResultArchive.Execute`
- render format: `SAFE_TEXT_BLOCKS`

The runtime and Go render path must:

- require a READY 0333 safe result-card read report
- use the authenticated own-student principal
- render through a dedicated product-render port, not JavaScript SQL or HTTP
- build one summary block and one or more guidance-section blocks
- record `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED`
- keep `contentRef`, raw `resultRef`, prompts, answer keys, raw model output,
  worker state, internal errors, rendered HTML, rendered Markdown, and unsafe
  markup out of the Student App response

## Non-Goals

This slice must not run model inference, construct prompts, call OCR/RAG,
perform Swarm orchestration, write archive data, publish new content, expose
full raw content, or complete the whole AI Tutor product. It only proves that a
previously reviewed, committed, verified, and read result can be rendered as a
safe Student App text-block envelope.

## Contracts

- Input consumes
  `reports/student-app-ai-tutor-result-student-archive-read.current.json`.
- Runtime output records
  `STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED`.
- HTTP path is
  `GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered`.
- Render format is `SAFE_TEXT_BLOCKS`.
- Render blocks allow `SUMMARY` and `GUIDANCE_SECTION`.
- Go response omits `contentRef`, `resultRef`, raw model output, prompts,
  answer keys, worker IDs, internal errors, rendered HTML, and rendered
  Markdown.
- Verified archive item is `tarch_student_ai_tutor_result_001`.

## Acceptance Criteria

- Runtime tests prove positive safe render, idempotent replay, conflicting
  replay rejection, missing port/object rejection, cross-student rejection,
  mismatched envelope rejection, unsafe policy rejection, leaked field
  rejection, unsafe text rejection, and missing evidence rejection.
- Go tests prove the domain builder creates safe text blocks from a safe result
  card, rejects unsafe card states, and the use case propagates reader boundary
  errors before rendering.
- HTTP tests prove the rendered endpoint returns `SAFE_TEXT_BLOCKS`, summary
  and guidance-section blocks, and rejects cross-student, teacher, and wrong
  method access.
- Audit verifies 0333 readiness, runtime identity, injected product-render
  port, no raw DB/SQL/HTTP/model/tool/Swarm access, no HTML/Markdown rendering,
  runtime probe under 50ms, negative test coverage, Go domain/usecase/HTTP and
  OpenAPI path, package script, quality gate hook, root workflow coverage hook,
  structure verifier hook, root trace row, and architecture board update.

## Performance Note

This is a control-plane/product-render boundary. It validates one READY 0333
read report, calls one injected product-render port, maps one safe result card
to a text-block envelope, and appends one JSONL evidence record. Runtime SLO
target remains under 50ms. The whole-system production10k evidence remains
`22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; this slice does not
repeat large-scale performance testing.

## Rollback

Remove the runtime/audit/test files, SDD 0334, report file, package script,
quality-gate entry, root workflow coverage hook, structure verifier entry, root
trace row, Go domain/usecase/HTTP/OpenAPI additions, and architecture-board
note. Keep SDD 0320-0333 intact because the Student App AI Tutor reviewed
delivery, archive commit, row verification, and safe result-card read chain
remains valid.
