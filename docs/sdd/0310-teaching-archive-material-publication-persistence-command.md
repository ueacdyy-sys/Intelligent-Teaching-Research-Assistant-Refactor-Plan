# SDD 0310: Teaching Archive Material Publication Persistence Command

## Problem

SDD 0309 creates a Student App renderable material delivery envelope. That envelope is intentionally student-visible at the delivery boundary, but it is not a durable publication record. The next boundary must prepare a reviewed persistence command without starting database writes, durable publication commit, OCR/RAG enrichment, AI grading, model inference, remote device control, local tool mutation, or Swarm.

This slice records an append-only command that a later durable publication commit can consume. It advances the Teaching Archive publication chain while preserving the safety boundary between renderable delivery evidence and physical persistence.

## Scope

Add `TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY` report with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED`. It requires a controlled service principal, a delivery-envelope-matched persistence request, idempotency, and a policy that allows only append-only command logging.

The runtime records `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED` with command state `NOT_COMMITTED_TO_PUBLICATION_STORE`.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY` with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED`.
- Source safety must prove publication approval, safe delivery envelope creation, student own scope, and student-visible material delivery.
- Source safety must keep durable publication persistence, publication commit, main database writes, student archive writes, raw DB access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, tool mutation, remote device control, and Swarm disabled.
- Principal must be a controlled `SERVICE` using `PUBLICATION_PERSISTENCE_COMMAND_RUNTIME` with `TEACHING_READ`, `PUBLICATION_PERSISTENCE_COMMAND`, and `STUDENT_ARCHIVE_WRITE_INTENT`.
- Persistence request must match the 0309 delivery envelope id, approval id, publication candidate id, archive item id, student id, material type, title, content ref, and student scope ref.
- Persistence policy must require the delivery envelope, append-only command log, student own scope, approval evidence preservation, material pointer preservation, future durable commit review, and idempotent command logging.
- Persistence policy must keep durable publication commit, database writes, raw DB access, HTTP execution, OCR/RAG, AI grading, model inference, local tool mutation, remote device control, and Swarm disabled.

## Acceptance Criteria

- Runtime tests cover success, idempotent replay, idempotency conflict, unsafe principal, unsafe delivery report, request mismatch, missing evidence, unsafe policy, leaked fields, unsafe text, and durable publication collapse.
- Audit verifies source delivery readiness, runtime identity, command idempotency, commit/model/DB safety, one command probe, tests, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in Teaching Archive and Student App workflows.
- Quality gate includes this audit before root workflow coverage.
- Architecture board states 10.66/10 as publication persistence command evidence, not durable publication commit, OCR/RAG enrichment, AI grading, true model inference, or a new production10k benchmark.

## Performance Note

This is an in-process append-only command record. It is intentionally not a production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing append-only command logs are idempotent evidence and can be ignored by a later durable publication persistence design if this boundary changes.
