# SDD 0309: Teaching Archive Material Publication Delivery Envelope

## Problem

SDD 0308 records a teacher/admin approval for later material publication delivery. That approval is still not a durable publication commit. The next boundary must let the Student App render the approved material through a controlled delivery envelope while keeping database writes, durable archive publication, OCR/RAG enrichment, AI grading, model inference, remote device control, local tool mutation, and Swarm disabled.

This slice adds a renderable delivery envelope for approved Teaching Archive material. It is student-visible at the envelope boundary, but it is not a persisted publication record.

## Scope

Add `TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL` report with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED`. It requires a controlled service principal, an approved publication candidate, a student-scoped delivery request, and a delivery-only policy.

The runtime records an append-only `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED` envelope. Durable publication persistence, OCR/RAG enrichment, AI grading, and model execution remain later reviewed slices.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL` with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED`.
- Source safety must prove source precheck, physical row verification, human precheck, publication approval, and `approvedForPublicationDelivery=true`.
- Source safety must keep publication commit, student-visible publication, delivery envelope creation, database writes, raw DB access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, tool mutation, remote device control, and Swarm disabled.
- Principal must be a controlled `SERVICE` using `STUDENT_DELIVERY_RUNTIME` with `TEACHING_READ`, `STUDENT_DELIVERY_ENVELOPE`, and `STUDENT_APP_DELIVERY`.
- Delivery request must match the 0308 approved candidate id, archive item id, student id, material type, title, and content ref.
- Delivery policy must require publication approval, student own scope, safe material envelope, future durable publication persistence review, and idempotent command logging.
- Delivery policy must keep database writes, durable publication commit, raw DB access, HTTP execution, OCR/RAG, AI grading, model inference, local tool mutation, remote device control, and Swarm disabled.

## Acceptance Criteria

- Runtime tests cover success, idempotent replay, idempotency conflict, unsafe principal, unapproved source, delivery mismatch, missing evidence, unsafe policy, leaked fields, unsafe text, and durable publication collapse.
- Audit verifies source approval readiness, runtime identity and safety boundaries, one delivery-envelope probe, tests, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in Teaching Archive and Student App workflows.
- Quality gate includes this audit before root workflow coverage.
- Architecture board states 10.63/10 as delivery-envelope evidence, not durable publication, OCR/RAG enrichment, AI grading, true model inference, or a new performance benchmark.

## Performance Note

This is an in-process delivery-envelope command record. It is intentionally not a production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only delivery envelope logs are idempotent evidence and can be ignored by a later durable publication persistence design if this boundary changes.
