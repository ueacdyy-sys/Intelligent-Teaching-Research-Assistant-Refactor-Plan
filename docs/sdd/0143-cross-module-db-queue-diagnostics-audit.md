# SDD 0143: Cross-Module DB And Queue Diagnostics Audit

## Problem

Root workflow coverage proves that the current evidence maps back to the
immutable product requirements. It still does not explain whether the remaining
capacity risk is in PostgreSQL, PgBouncer, gateway database pools, in-process
write queues, AI worker dispatch, approval queues, or workflow/plugin registry
boundaries.

Without a cross-module diagnostic, a full-system capacity review could wrongly
sum module benchmark peaks and call that an ultra-concurrency limit. The
current evidence already shows that the Identity, Conversation, and Teaching
Archive module peak database pools nearly fill the PgBouncer server pool, so
the next review must see that headroom explicitly.

## Scope

In scope:

- Add `tools/cross-module-db-queue-diagnostics-audit.mjs`.
- Read current performance, workflow, worker, approval, quality, and connection
  budget reports.
- Summarize PostgreSQL, PgBouncer, backend, connection budget, and hot-path
  module pool headroom.
- Summarize module diagnostics for Identity, Conversation Write, Teaching
  Archive, Knowledge Retrieval, AI Worker, Agent Harness, and Workflow/Plugin.
- Summarize queue and worker boundaries:
  - Conversation in-process batched write queue;
  - AI worker admission and no direct main database writes;
  - Agent Harness approval queue with zero execution candidates;
  - Workflow/plugin sandbox plus human approval and registry admission.
- Fail readiness when source reports are missing, PgBouncer is not transaction
  pooled, connection budget fails, module database profiles are absent,
  conversation DB acquisition becomes the current bottleneck, queue boundaries
  regress, sustained mixed workload scale-up is dirty, root workflow coverage
  is not ready, or strict quality fails.
- Add an npm script and wire the audit into the quality gate.
- Register the generated report as performance evidence.
- Let the system capacity claim audit remove only the
  `CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS` gap; root SLO promotion review
  remains required.

Out of scope:

- Claiming full-system ultra-concurrency support.
- Running a new live high-concurrency benchmark.
- Adding model, OCR, RAG, vector, embedding, training, or load-generation
  dependencies to the baseline.
- Replacing the later root SLO promotion review.

## Contracts

- `npm run audit:cross-module-db-queue` writes
  `reports/cross-module-db-queue-diagnostics.current.json`.
- The report uses
  `workloadType=CROSS_MODULE_DATABASE_AND_QUEUE_DIAGNOSTICS`.
- The report records:
  - PostgreSQL `maxConnections` and `sharedBuffers`;
  - PgBouncer `poolMode`, `listenPort`, and `maxDbConnections`;
  - explicit connection budget planned/safe/hard limits;
  - current hot-path module database pool total and PgBouncer headroom;
  - module database and queue/worker classifications;
  - sustained mixed workload scale-up cleanliness;
  - a next action that still requires root SLO promotion review.
- The capacity audit recognizes this evidence but keeps
  `PROMOTION_REVIEW_AGAINST_ROOT_SLOS` as the remaining blocker.

## Acceptance Criteria

- Focused tests pass for the current cross-module DB/queue evidence.
- Focused tests fail when a required source report is missing.
- Focused tests fail when PgBouncer is not in transaction mode.
- Focused tests fail when the planned connection budget exceeds the safe limit.
- Focused tests fail when current module peak pools exceed PgBouncer
  `max_db_connections`.
- Focused tests fail when AI worker admission would allow direct main database
  writes.
- Focused tests fail when sustained mixed workload scale-up is no longer clean.
- Focused tests fail when strict quality is not passing.
- Capacity audit tests prove cross-module diagnostics remove only that evidence
  gap while root SLO promotion review remains required.
- `node --check tools/cross-module-db-queue-diagnostics-audit.mjs` passes.
- `node --test tools/cross-module-db-queue-diagnostics-audit.test.mjs` passes.
- `npm run test:tools` and `npm run quality` pass.

## Rollback

Remove the cross-module DB/queue diagnostics audit, focused tests, package
script, quality gate command, generated report, performance registry entry,
capacity audit changes, and this SDD. Root workflow coverage and sustained
mixed workload evidence remain usable, but the capacity claim must again list
cross-module diagnostics as missing.

## Observability And Performance Evidence

The report is intentionally diagnostic rather than promotional. The current
expected signal is:

- PostgreSQL and PgBouncer performance profile is ready.
- Proposed cross-service connection budget passes.
- Current source-evidence hot path pool is explicit and tight against
  PgBouncer, which blocks casual full-system promotion.
- Conversation DB acquisition is not the current bottleneck in low-tail and WSL
  burst evidence.
- AI worker and workflow/plugin execution remain isolated behind dispatch,
  sandbox, review, and approval boundaries.
- Sustained mixed workload scale-up has zero workload and orchestration errors.
- Root SLO promotion review remains the next required evidence.
