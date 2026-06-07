# SDD 0311: Teaching Archive Material Publication Storage Commit

## Problem

SDD 0310 records an append-only publication persistence command. That command is still not a durable publication-store commit. The next boundary must consume the reviewed command and commit the student-visible publication through an injected use-case port without letting the JavaScript runtime reach into SQL, HTTP, OCR/RAG, AI grading, model inference, remote device control, local tool mutation, or Swarm.

This slice advances Teaching Archive material publication from command evidence to durable publication storage evidence. It still leaves physical publication-row verification and Student App published-material read verification for later slices.

## Scope

Add `TeachingArchiveMaterialPublicationStorageCommitPort.commitTeachingArchiveMaterialPublication`.

The runtime consumes only a READY `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND` report with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`. It requires a storage commit request that exactly matches the 0310 command, an idempotency key, and an injected `TeachingArchivePublicationCommitPort.commitPublication`.

The runtime records `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_STORAGE_COMMITTED` with publication state `COMMITTED_TO_PUBLICATION_STORE`.

## Contracts

- Source report must be `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND` with `TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED`.
- Source safety must prove delivery-envelope verification, append-only command logging, student own scope, and publication persistence command recording.
- Source safety must prove durable commit, database writes, raw DB access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, tool mutation, remote device control, and Swarm were not started in 0310.
- Storage commit request must match source command record id, source command id, delivery envelope id, approval id, publication candidate id, archive item id, student id, material type, title, content ref, and student scope ref.
- Storage commit policy must allow only the injected durable publication commit, main database write, student archive write, and student-visible publication.
- Storage commit policy must keep raw database access, HTTP execution, OCR/RAG writes, AI grading writes, model inference, local tool mutation, remote device control, and Swarm disabled.
- The JavaScript runtime must not verify a physical database row; that remains a later row-verification slice through a read port.

## Acceptance Criteria

- Runtime tests cover success, idempotent replay, idempotency conflict, unsafe source report, request mismatch, missing evidence, missing port, unsafe policy, leaked fields, unsafe text, and unsafe port results.
- Audit verifies source command readiness, runtime identity, idempotency, injected-port commit, no raw DB/HTTP/model/Swarm side effects, one commit probe, tests, quality gate, root workflow coverage, structure verifier, SDD, and architecture board hooks.
- Root workflow coverage includes this slice in Teaching Archive and Student App workflows.
- Quality gate includes this audit before root workflow coverage.
- Architecture board states 10.69/10 as publication storage commit evidence, not physical publication row verification, OCR/RAG enrichment, AI grading, true model inference, or a new production10k benchmark.

## Performance Note

This is an in-process injected-port commit probe. It is intentionally not a production10k benchmark. Current whole-system performance evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99 remains an aspirational production target.

## Rollback

Remove the runtime, tests, audit, report registration, quality-gate entry, root workflow hook, structure-verifier entry, and architecture-board note. Existing idempotent commit logs are evidence artifacts; they can be ignored by a later publication-row verification design if this boundary changes.
