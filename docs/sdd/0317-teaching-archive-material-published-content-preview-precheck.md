# SDD 0317: Teaching Archive Material Published Content Preview Precheck

## Problem

SDD 0316 proves that the Student App can read safe metadata for one published archive item. The next product temptation is to show a content preview. That is a high-risk boundary: a careless preview path could leak raw material content, `contentRef`, object storage keys, OCR text, answer keys, publication internals, worker state, or model output.

This slice does not implement content preview. It adds a conservative precheck that consumes the 0316 detail metadata evidence and records a safe block decision until a reviewed content preview store and renderer exist.

## Scope

Add `TeachingArchiveMaterialPublishedContentPreviewPrecheckPort.recordStudentAppPublishedMaterialContentPreviewPrecheck`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ` report with `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED`. It verifies that the selected archive item is the authenticated student's own published item, that 0316 excluded `contentRef`, and that no safe content preview store is available in this baseline. It then records `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_CONTENT_PREVIEW_PRECHECK_BLOCKED_UNTIL_SAFE_CONTENT_STORE`.

This slice does not read raw content, expose `contentRef`, access object storage, start OCR/RAG, perform semantic retrieval, call a model, write AI grading state, write publication state, execute HTTP, connect to a database, mutate local tools, control remote devices, or start Swarm.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ` with `TEACHING_ARCHIVE_MATERIAL_PUBLISHED_DETAIL_METADATA_READ_VERIFIED`.
- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and match the same student id as the 0316 detail metadata result.
- Selected `archiveItemId` must match the 0316 `responseMetadata.id` and keep the `tarch_` safe id token shape.
- Selected archive item metadata may include only id, ownerType, studentId, materialType, title, source, tags, analysisIntents, ocrStatus, and createdAt.
- Policy must declare `contentPreviewPrecheckOnly=true`, `safeContentPreviewStoreRequiredBeforeRead=true`, and `authoritativeContentPreviewStoreAvailable=false`.
- Policy must keep raw content reads, `contentRef` disclosure, object storage reads, direct database access, HTTP execution, OCR/RAG writes, semantic retrieval, AI grading writes, model inference, publication writes, remote device control, local tool mutation, and Swarm disabled.
- Runtime result must record a block decision, not preview text, HTML, OCR text, chunks, embeddings, files, bytes, or storage references.

## Acceptance Criteria

- Runtime tests cover successful block decision, idempotent replay, idempotency conflict, unsafe 0316 source report, unsafe principal, unsafe policy, missing evidence, leaked `contentRef`, leaked raw preview fields, and forbidden DB/HTTP/object-storage/OCR/RAG/model/Swarm claims.
- Audit verifies 0316 source readiness, runtime identity, runtime probe, blocked preview decision, tests, package script, strict quality gate, root workflow coverage, structure verifier, SDD, root trace, and architecture board hooks.
- Root workflow coverage includes this slice in both Teaching Archive and Student App workflows.
- Architecture board states 10.87/10 as a content preview precheck that blocks until a safe preview store/rendering boundary exists; it must not claim raw content preview, OCR/RAG enrichment, semantic retrieval, AI grading linkage, full material retrieval, Swarm, or a new production10k benchmark.

## Performance Note

This is not a new production10k benchmark. The precheck is a control-plane admission decision over existing 0316 evidence and should stay under the 50ms runtime target. It intentionally avoids raw content IO, object storage, database access, HTTP calls, OCR/RAG, and model inference.

Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains the aspirational production target.

## Rollback

Remove the content preview precheck runtime, tests, audit, report, package script, quality-gate entry, root workflow hook, structure-verifier entry, root trace row, and architecture-board note. Keep SDD 0316 and the Student App detail metadata endpoint intact because safe published metadata read remains valid without content preview.
