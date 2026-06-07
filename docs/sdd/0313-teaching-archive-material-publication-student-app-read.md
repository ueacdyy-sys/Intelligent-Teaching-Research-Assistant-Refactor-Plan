# SDD 0313: Teaching Archive Material Publication Student App Read

## Problem

SDD 0312 proves that a reviewed Teaching Archive material publication exists as a physical `teaching_archive_publications` row with `STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED`. That still does not prove the Student App product boundary can read the corresponding archive material for the owning student.

This slice verifies Student App visibility after publication row verification. It advances the Teaching Archive publication chain without repeating production10k benchmarks and without pretending that publication projection hardening, OCR/RAG enrichment, AI grading, model inference, or complete material search is finished.

## Scope

Add `TeachingArchiveMaterialPublicationStudentAppReadPort.verifyStudentAppPublishedMaterialRead`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION` report with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED`. It requires an own-student `USER/STUDENT/STUDENT_APP` principal with `STUDENT_OWN_READ`, then calls an injected `StudentAppPublishedArchiveMaterialsReadPort.listStudentAppPublishedArchiveMaterials`.

The product read source must map to the existing Student App archive boundary: `GET /v1/student-app/archive-items`, `ListStudentAppArchiveItems.Execute`, and `ArchiveRepository.List`. The response must include the same published archive material fields from the 0312 publication row: `archiveItemId`, `studentId`, `materialType`, `title`, and `contentRef`.

The current Go product entry reads own-student archive metadata. It does not yet implement a hardened publication projection or join against the publication store. This slice therefore records Student App visibility after 0312 publication evidence, while explicitly keeping publication projection hardening and OCR/RAG/search as later reviewed slices.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_ROW_VERIFICATION` with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PHYSICAL_ROW_VERIFIED`.
- Source invariants must prove publication row verification, main database read allowance, `studentVisiblePublished=true`, future Student App published-material read requirement, and no direct database access.
- Source publication record must be `COMMITTED_TO_PUBLICATION_STORE`, `STUDENT_VISIBLE_ARCHIVE_MATERIAL_PUBLISHED`, `STUDENT_APP`, and `STUDENT_OWN_ARCHIVE`.
- Principal must be `USER/STUDENT/STUDENT_APP`, include `STUDENT_OWN_READ`, and resolve to the same student id as the publication row.
- Product read policy must require publication row verification, own-student principal, the Student App archive-items endpoint, an injected published archive material read port, own-student-only scope, product inclusion of the published material, publication-row-to-response matching, idempotent verification, and Go use-case read.
- Product read policy must keep direct database access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, publication writes, remote device control, local tool mutation, and Swarm disabled.
- Product response must not expose publication metadata such as approval ids, publication state, worker state, raw model output, answer keys, internal errors, or scoring fields.

## Acceptance Criteria

- Runtime tests cover successful published-material read, idempotent replay, idempotency conflict, unsafe publication row source, unsafe policy, missing port, missing published material, cross-student principal, mismatched response, leaked fields, unsafe text, publication metadata leaks, missing row evidence, missing product entry evidence, and future-gated publication/RAG/model work.
- Audit verifies 0312 source readiness, runtime identity, idempotency, no raw DB/HTTP/model/Swarm side effects, one product-read probe, tests, existing Go Student App archive-items evidence, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in both Teaching Archive and Student App workflows.
- Quality gate includes this audit before root workflow coverage.
- Architecture board states 10.75/10 as Student App published-material read evidence, not a hardened publication projection, OCR/RAG enrichment, AI grading, true model inference, full material retrieval, or a new production10k benchmark.

## Performance Note

This is an in-process product-read verification probe through an injected port. It is intentionally not a new production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains an aspirational production target.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only verification logs are evidence artifacts and can be ignored by later publication projection, OCR/RAG, or material search slices if this boundary changes.
