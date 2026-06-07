# SDD 0315: Teaching Archive Material Published Search Foundation

## Problem

SDD 0314 proves that Student App archive material reads are filtered by the publication projection. The next root-product gap is discoverability: a student can read the published list, but cannot yet search their own published learning materials from the Student App product entry.

This must not be implemented as broad archive search. A student-facing search path must stay scoped to the authenticated student's own published materials, must keep using the publication projection, and must not expose unpublished items, draft-only items, cross-student records, answer keys, model output, raw content, approval metadata, worker state, internal errors, or publication-store internals.

## Scope

Add `TeachingArchiveMaterialPublishedSearchFoundationPort.verifyStudentAppPublishedMaterialSearch`.

This slice consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING` report with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED`. It then verifies published material metadata search through an injected `StudentAppPublishedMaterialSearchPort.searchPublishedArchiveMaterials`.

The Go product path adds an optional `query` parameter to `GET /v1/student-app/archive-items`. The query is normalized at the domain boundary, propagated through `ListStudentAppArchiveItems.Execute`, and handled by `ArchiveRepository.ListPublishedForStudentApp` inside the same `teaching_archive_publications` visible publication projection used by SDD 0314.

Search scope is intentionally narrow:

- title and tags only
- authenticated student's own published archive materials only
- Student App channel only
- safe metadata response only

This slice does not add OCR, RAG, full-content indexing, semantic retrieval, AI grading linkage, model inference, publication writes, remote device control, local tool mutation, or Swarm.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENING` with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PROJECTION_HARDENED`.
- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and resolve to the same student as the hardened published archive item.
- Search input must be normalized whitespace, length-limited to 120 characters, and reject control characters or unsafe text.
- Search source must be `GET /v1/student-app/archive-items?query=`, `ListStudentAppArchiveItems.Execute`, and `ArchiveRepository.ListPublishedForStudentApp`.
- Repository evidence must prove `teaching_archive_publications` filtering remains active while title/tag search is applied.
- Product response may include only safe archive item metadata and must not include publication IDs, visibility state, approval metadata, raw content, answer keys, model output, worker state, or internal errors.
- Runtime must keep direct database access, HTTP execution, full-text content reads, OCR/RAG writes, AI grading writes, model inference, publication writes, remote device control, local tool mutation, and Swarm disabled.

## Acceptance Criteria

- Runtime tests cover successful published metadata search, query normalization, idempotent replay, idempotency conflict, unsafe source report, unsafe policy, missing port, unsafe query, missing expected material, generic repository misuse, non-matching returned item, cross-student leak, missing exclusion proof, product metadata leak, model output leak, and missing evidence refs.
- OpenAPI exposes optional `query` on `GET /v1/student-app/archive-items` with safe string bounds.
- Go domain input includes `Query`, normalizes it into `ArchiveItemQuery.SearchText`, and rejects overlong or control-character queries.
- HTTP handler passes the query parameter into the use case.
- Use case forwards `SearchText` only to `ListPublishedForStudentApp` and does not call the generic `ArchiveReader.List`.
- Generic archive list inputs and `ArchiveRepository.List` do not expose or execute Student App search, so this slice cannot silently become broad archive search.
- PostgreSQL repository searches `item.title` and `jsonb_array_elements_text(item.tags)` with escaped `ILIKE` patterns while retaining the publication projection `EXISTS` filter.
- Cache keys include `SearchText` so different searches cannot share stale responses.
- SQL schema and SQL contract include `idx_teaching_archive_items_student_material_search_scope` in the full profile and drop it from the `hot_write` profile.
- Audit verifies 0314 source readiness, runtime identity, runtime probe, Go/OpenAPI/SQL/cache evidence, tests, package script, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in both Teaching Archive and Student App workflows.
- Architecture board states 10.81/10 as published-material metadata search foundation evidence, not OCR/RAG enrichment, AI grading linkage, full material retrieval, Swarm, or a new production10k benchmark.

## Performance Note

This is not a new production10k benchmark. The performance risk introduced by this slice is a filtered title/tag metadata search on a student-owned archive item set. The design keeps the publication projection as the outer safety boundary and adds `idx_teaching_archive_items_student_material_search_scope` for the student/material/time scan shape.

For very large per-student material sets, future OCR/RAG or semantic retrieval should use a separate reviewed slice with dedicated indexes or retrieval stores. This foundation deliberately avoids bringing vector, embedding, OCR, model, or training dependencies into the baseline runtime.

Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains the aspirational production target.

## Rollback

Remove the Student App `query` parameter, remove `ArchiveItemQuery.SearchText` propagation if no downstream slices depend on it, remove the title/tag filter from `ArchiveRepository.ListPublishedForStudentApp`, remove `idx_teaching_archive_items_student_material_search_scope`, and remove the 0315 runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note.
