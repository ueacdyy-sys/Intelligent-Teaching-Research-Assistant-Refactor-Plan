# SDD 0308: Teaching Archive Material Publication Approval

## Problem

SDD 0307 records that a teaching archive material can enter a teacher/admin publication approval queue. That is still not a delivery boundary. Approval must be explicit, idempotent, human-scoped, and separated from actual student-visible publication, OCR/RAG enrichment, AI grading writes, model inference, and durable delivery.

This slice adds the next reviewed gate: a teacher/admin publication approval record. It advances the Teaching Archive material workflow while keeping publication delivery, OCR/RAG enrichment, retrieval productization, and AI grading as later slices.

## Scope

Add `TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK` report with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY`. It requires a human teaching teacher with publication approval scope, or an admin, an approval-only policy, and an approval payload that matches the exact publication candidate from 0307.

The runtime records an append-only approval decision of `APPROVED_FOR_PUBLICATION_DELIVERY`. This means the item may enter a future publication delivery runtime. It does not publish anything.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK` with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY`.
- Source safety must prove product-read source, physical row verification, human precheck, and publication approval requirement.
- Source safety must keep publication commit, student-visible publication, database writes, raw DB access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, tool mutation, remote device control, and Swarm disabled.
- Principal must be a human `TEACHER` using `DESKTOP_TEACHING` with `TEACHING_ARCHIVE_REVIEW` and `TEACHING_ARCHIVE_PUBLISH_APPROVE`, or an `ADMIN` with `ADMIN_SYSTEM`.
- Approval payload must match the 0307 candidate id, archive item id, student id, material type, title, and content ref.
- Approval policy must require source publication precheck, human approval, candidate match, no sensitive leakage, future delivery runtime, and idempotent command logging.
- Approval policy must keep direct publication, student-visible delivery, database writes, raw DB access, HTTP execution, OCR/RAG, AI grading, model inference, local tool mutation, remote device control, and Swarm disabled.

## Acceptance Criteria

- Runtime tests cover success, idempotent replay, idempotency conflict, forbidden principal, unsafe source precheck, approval mismatch, missing evidence, unsafe policy, leaked fields, unsafe text, and delivery collapse.
- Audit verifies source precheck readiness, runtime identity and safety boundaries, one approval probe, tests, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in Teaching Archive and Student App workflows.
- Quality gate includes this audit before root workflow coverage.
- Architecture board states 10.60/10 as publication approval evidence, not actual publication, OCR/RAG enrichment, AI grading, true model inference, or a new performance benchmark.

## Performance Note

This is an in-process publication approval command record. It is intentionally not a production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only approval logs are idempotent evidence and can be ignored by a later publication delivery design if this boundary changes.
