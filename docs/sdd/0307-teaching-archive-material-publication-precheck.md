# SDD 0307: Teaching Archive Material Publication Precheck

## Problem

SDD 0306 proves that the 0305 physical archive row can be read from the student app product entry. That is still not a safe publication boundary. A student-visible archive read must not be treated as approval to publish the material, start OCR/RAG enrichment, write AI grading state, call a model, or expose broader teaching material content.

This slice adds the next reviewed gate: a teacher/admin publication precheck record. It advances the Teaching Archive material workflow while keeping publication approval, OCR/RAG enrichment, retrieval productization, and AI grading as later slices.

## Scope

Add `TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ` report with `TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED`. It requires a human teaching teacher or admin principal, a precheck-only publication policy, and a publication candidate that matches the exact `tarch_archive_material_001` archive item from 0306.

The runtime records an append-only publication precheck decision of `READY_FOR_PUBLICATION_APPROVAL`. This means the item may enter a future human publication approval slice. It does not publish anything.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ` with `TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED`.
- Source safety must have physical row verification, own-student product read, endpoint verification, product response match, and leak prevention set to true.
- Source safety must keep direct database access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, publication, tool mutation, remote device control, and Swarm disabled.
- Principal must be a human `TEACHER` using `DESKTOP_TEACHING` with `TEACHING_ARCHIVE_READ` and `TEACHING_ARCHIVE_REVIEW`, or an `ADMIN` with `ADMIN_SYSTEM`.
- Publication candidate must match the 0306 archive item id, student id, material type, title, and content ref.
- Precheck policy must require source student product read, physical row verification, human precheck, no sensitive leakage, future publication approval, idempotent command logging, and precheck-only mode.
- Precheck policy must keep direct publication, student-visible delivery, database writes, raw DB access, HTTP execution, OCR/RAG, AI grading, model inference, local tool mutation, remote device control, and Swarm disabled.

## Acceptance Criteria

- Runtime tests cover success, idempotent replay, idempotency conflict, forbidden principal, unsafe source report, candidate mismatch, missing evidence, unsafe policy, leaked fields, unsafe text, and future-work collapse.
- Audit verifies source product-read readiness, runtime identity and safety boundaries, one precheck probe, tests, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in Teaching Archive and Student App workflows.
- Quality gate includes this audit before root workflow coverage.
- Architecture board states 10.57/10 as publication precheck evidence, not actual publication, OCR/RAG enrichment, AI grading, true model inference, or a new performance benchmark.

## Performance Note

This is an in-process publication precheck command record. It is intentionally not a production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only precheck logs are idempotent evidence and can be ignored by a later publication approval design if this boundary changes.
