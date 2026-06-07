# SDD 0314: Teaching Archive Material Publication Projection Hardening

## Problem

SDD 0313 proves that the Student App product entry can read the archive item produced by a verified publication row. It also records the remaining gap: the existing Student App archive-items path reads own-student archive metadata and does not yet prove that every returned item is filtered by the publication store.

That is unsafe for the root product requirement because a student-facing published-material list must not expose a draft-only archive item, an unpublished archive item, another student's archive item, approval metadata, model output, answer keys, worker state, or internal errors.

## Scope

Add `TeachingArchiveMaterialPublicationProjectionHardeningPort.verifyStudentAppPublishedMaterialProjection`.

This slice consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ` report with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED`. It then verifies a hardened Student App publication projection through an injected `StudentAppPublishedMaterialProjectionReadPort.listPublishedArchiveMaterials`.

The Go product path is hardened by replacing the Student App archive-items use case dependency from the generic `ArchiveReader.List` path to the narrower `StudentAppPublishedArchiveMaterialReader.ListPublishedForStudentApp` port. The concrete PostgreSQL adapter implements `ArchiveRepository.ListPublishedForStudentApp` by reading `teaching_archive_items` only when a matching `teaching_archive_publications` row exists with:

- `scope_type = STUDENT_OWN_ARCHIVE`
- `publication_state = COMMITTED_TO_PUBLICATION_STORE`
- `visibility_state = STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED`
- `channel = STUDENT_APP`
- matching `archive_item_id` and `student_id`

The SQL contract and runtime schema now include `teaching_archive_publications` plus lookup indexes for the Student App visible publication projection.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ` with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STUDENT_APP_READ_VERIFIED`.
- Source invariants must prove product response matched the publication row, metadata was not exposed, cross-student leakage was prevented, and future projection hardening was required.
- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and resolve to the same student as the published archive item.
- Projection source must be `GET /v1/student-app/archive-items`, `ListStudentAppArchiveItems.Execute`, `ArchiveRepository.ListPublishedForStudentApp`, and `teaching_archive_publications`.
- Projection source must prove publication-store filtering, publication-state filtering, visibility-state filtering, Student App channel filtering, and own-student filtering.
- Projection exclusion evidence must prove unpublished archive items, draft-only archive items, cross-student archive items, and publication metadata are excluded from the Student App response.
- Product response may include only safe archive item metadata and must match the published archive item id, student id, material type, title, and content ref.
- Runtime must keep direct database access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, publication writes, remote device control, local tool mutation, and Swarm disabled.

## Acceptance Criteria

- Runtime tests cover successful projection hardening, idempotent replay, idempotency conflict, unsafe source report, unsafe policy, missing port, missing material, generic repository misuse, missing exclusion proof, mismatched response, leaked fields, publication metadata leak, and missing evidence refs.
- Go use case depends on `StudentAppPublishedArchiveMaterialReader`, not the generic archive reader, for Student App archive-items.
- Gateway wiring uses `NewListStudentAppArchiveItems(archiveRepository)` so the Student App product path cannot bypass the publication projection.
- PostgreSQL repository implements `ListPublishedForStudentApp` with an `EXISTS` filter against `teaching_archive_publications`.
- SQL schema and SQL contract include `teaching_archive_publications` and `idx_teaching_archive_publications_student_app_visible_lookup`.
- Audit verifies 0313 source readiness, runtime identity, runtime probe, Go/SQL evidence, tests, package script, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in both Teaching Archive and Student App workflows.
- Architecture board states 10.78/10 as hardened Student App publication projection evidence, not OCR/RAG enrichment, AI grading, full material retrieval, Swarm, or a new production10k benchmark.

## Performance Note

This is not a new production10k benchmark. The functional performance risk introduced by hardening is the extra publication-store existence check on Student App reads. The design uses an `EXISTS` filter plus a partial lookup index on `(archive_item_id, student_id)` for the visible Student App publication state so the filter is a bounded indexed lookup, not an unbounded join.

Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains an aspirational production target.

## Rollback

Revert the Student App archive-items dependency to the generic archive reader, remove `ArchiveRepository.ListPublishedForStudentApp`, remove the publication projection schema additions if no downstream data exists, and remove the 0314 runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note.
