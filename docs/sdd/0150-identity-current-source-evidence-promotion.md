# SDD 0150: Identity Current Source Evidence Promotion

## Problem

The latest Identity 4400-concurrency run uses the PgBouncer 120-headroom runtime
and the ingress pre-connect retry slice. It is the current best source evidence
for the Identity module, but the root capacity audits still read the older
unlogged-session-table 4400 report.

That makes the full-system review partially stale: it can report a blocked SLO
against evidence that is no longer the active Identity profile.

## Source Requirement References

- Immutable root requirement: identity and remote entry points remain part of
  the whole-system runtime claim.
- SDD 0148: PgBouncer production headroom was applied to the runtime profile.
- SDD 0149: ingress pre-connect retry converted the same 4400 profile from a
  refresh 502 failure into a passed functional probe.

## Scope

In scope:

- Make cross-module DB/queue diagnostics consume the latest Identity 4400 report.
- Make system capacity claim auditing require the same latest Identity evidence.
- Preserve the root SLO block when the new evidence still exceeds the
  interactive P99 target.
- Keep old reports as historical evidence.

Out of scope:

- Rewriting historical performance reports.
- Promoting full-system ultra-concurrency.
- Changing public Identity HTTP contracts or session semantics.
- Adding training, OCR, RAG, vector, embedding, model, cache, or queue
  dependencies.

## Contracts

- `sourceFiles.identity` points at the current Identity source report:
  `reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-preconnect-retry-ingress19080-clean-table-docker-bench.json`.
- `requiredEvidence` for the system capacity audit requires
  `identity_http_gateway_pgbouncer120_preconnect_retry_4400`.
- Root SLO promotion remains blocked when the consumed Identity P99 exceeds
  `1000ms`.

## Acceptance Criteria

- Tests fail when cross-module diagnostics still consume the older Identity
  report.
- Tests fail when system capacity auditing still requires the older Identity
  evidence id or report path.
- Cross-module diagnostics report the current Identity source path and P99
  metrics from the PgBouncer 120 pre-connect retry report.
- System capacity claim auditing consumes the current Identity report.
- `npm run audit:cross-module-db-queue`,
  `npm run audit:root-slo-promotion-review`,
  `npm run audit:system-capacity-claim`, and strict quality pass.

## Rollback

Restore the previous Identity source report path and required evidence id, then
rerun the cross-module, root SLO, system capacity, and quality gates.
