# SDD 0139: Teaching Archive Mixed Workload Slice

## Problem

The system mixed workload runners covered identity, research conversation
writes, knowledge retrieval, and AI worker admission. That was useful, but it
still under-covered the immutable root requirements because the teaching mode
depends on student archives, teaching materials, quiz answers, AI grading
metadata, attendance, and the future student app.

Performance evidence that skips Teaching Archive can overstate the system. The
next slice must add a real read/write teaching path to the mixed workload before
any full-system capacity discussion continues.

## Source Requirement References

- Root requirement: the refactor is for the whole Intelligent Teaching Research
  Assistant; module order is only delivery order.
- Root requirement: teaching mode includes student archives, teaching
  materials, in-class quiz, AI grading, attendance, tutoring analysis, and
  student-app access.
- Root requirement: baseline runtime stays small; model, OCR, RAG, vector,
  embedding, training, and heavy AI dependencies remain outside the default
  performance harness.
- SDD 0136: full-system ultra-concurrency needs mixed workload evidence and
  promotion review against root workflow SLOs.
- SDD 0137 and 0138: smoke and ladder evidence are review inputs only.

## Scope

In scope:

- Add `tools/run-teaching-archive-benchmark.mjs` focused tests.
- Add `npm run bench:teaching-archive:pgbouncer`.
- Exercise a Teaching Archive read/write path:
  - teacher creates quiz archive items;
  - student submits quiz answers against those items;
  - teacher lists quiz archive items.
- Include Teaching Archive in the system mixed workload runner.
- Include Teaching Archive in the mixed workload ladder.
- Require current Teaching Archive evidence in the system capacity audit.
- Require Teaching Archive evidence registration in the performance evidence
  registry audit.
- Mask `ueacd` and database URLs in every generated report.

Out of scope:

- Promoting Teaching Archive smoke evidence as production capacity.
- Adding OCR, model inference, RAG, vector search, embedding, training, or
  external benchmark dependencies to the baseline.
- Replacing existing identity or conversation capacity decisions.
- Modifying the immutable root requirements document.

## Contracts

- `npm run bench:teaching-archive:pgbouncer` starts the local Go Teaching
  Archive gateway against the Docker PgBouncer/PostgreSQL profile and writes
  `reports/teaching-archive-benchmark.current.json`.
- The Teaching Archive report uses
  `benchmarkKind=teaching_archive_gateway` and
  `workloadType=HTTP_BENCHMARK`.
- The report records phase-level operations, errors, RPS, P95, and P99 for
  archive create, quiz submission create, and archive list.
- The system mixed workload runner now has five root slices: identity,
  conversation write, teaching archive, knowledge retrieval, and AI worker
  admission.
- Ladder step specs keep backward compatibility with
  `name:identityConcurrency:identityOperations:conversationConcurrency:conversationOperations`.
  When Teaching Archive values are omitted, they inherit the identity step
  concurrency and operation count. The explicit form appends
  `:teachingConcurrency:teachingOperations`.

## Acceptance Criteria

- Focused tests prove Teaching Archive option parsing, principal headers,
  report summaries, secret masking, fake successful workflow execution, and
  failed phase reporting.
- Focused tests prove the mixed workload runner builds five root-slice
  commands and rejects Teaching Archive port overlap.
- Focused tests prove ladder steps carry Teaching Archive load and preserve
  legacy compact step compatibility.
- The system capacity audit requires Teaching Archive evidence and classifies
  its current limit explicitly.
- `node --check tools/run-teaching-archive-benchmark.mjs` passes.
- Focused Teaching Archive, mixed workload, ladder, capacity, and registry tests
  pass.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the Teaching Archive benchmark runner/tests, package script, mixed
workload integration, ladder integration, Teaching Archive audit requirement,
registry entry, generated reports, and this SDD. Identity and conversation
performance evidence remain intact.

## Observability And Performance Evidence

This slice adds:

- `reports/teaching-archive-benchmark.current.json` for the Teaching Archive
  read/write path;
- Teaching Archive child reports under mixed workload smoke and ladder runs;
- a `Teaching Archive And Quiz` module-limit classification in the system
  capacity audit;
- registry coverage so future performance evidence cannot silently omit the
  teaching mode.
