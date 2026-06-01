# SDD 0135: Conversation Load Generator Runtime Decision Audit

## Problem

SDD 0134 separates low-tail transport settings from edge-stability settings, but
the benchmark runtime itself is now part of the performance story. Local Go,
Docker Go, and WSL Go do not apply the same socket, NAT, and scheduler pressure
to the Research conversation write gateway:

- Local Go gives the best 5800-concurrency low-tail result, but the unlimited
  6200-concurrency edge probe hits a Windows socket buffer error.
- WSL Go passes the same 6200 unlimited edge probe and reaches higher
  short-burst concurrency, so it is better evidence for upper-bound load
  generation.
- Docker Go passes smoke probes, but current reports show a much larger
  client/server gap and much lower throughput, so Docker must not be promoted as
  the primary high-concurrency load generator from this evidence alone.

The refactor needs this distinction in a machine-readable audit. Without it, a
future agent can mistake load-generator pressure for service capacity, or claim
that Docker is required for high concurrency even when current WSL evidence is
stronger.

## Source Requirement References

- Root requirement: Research mode conversation persistence must remain stable
  and efficient under high-concurrency teaching and research workflows.
- Root requirement: baseline runtime and package size must remain small; this
  audit must not add model, OCR, RAG, vector, embedding, training, or external
  load-test dependencies.
- SDD 0132: direct16 is the current Research conversation write fanout decision.
- SDD 0133: remaining tail latency is transport or pre-handler/listener
  scheduling, not database acquisition.
- SDD 0134: local low-tail and local edge transport settings are separate
  operational claims.

## Scope

In scope:

- Add a Docker-free Node audit over existing Local, WSL, and Docker benchmark
  reports.
- Select the low-tail runtime from same-concurrency 5800 reports.
- Select the practical high-concurrency runtime from WSL zero-error reports with
  P99 at or below the current 600ms edge threshold.
- Select the WSL functional burst ceiling separately from low-tail promotion.
- Keep Docker as smoke evidence unless repeated same-concurrency reports close
  the tail-latency gap.
- Register the decision as performance evidence and include it in the strict
  quality gate.

Out of scope:

- Running new live benchmarks.
- Changing Go gateway contracts, database schema, batching, PgBouncer,
  PostgreSQL, or worker fanout.
- Changing OS socket registry settings, Docker Desktop networking, or WSL
  networking settings.
- Claiming full-system sustained capacity from conversation-only short bursts.

## Contracts

- `npm run audit:conversation-loadgen-runtime` writes
  `reports/conversation-loadgen-runtime-decision.current.json`.
- The audit returns `READY` only when configured Local, WSL, and Docker source
  reports are present, parseable, and include runtime, transport, latency,
  Server-Timing, database acquisition, and error metrics.
- The audit must not recommend runtime changes if `db.acquire` P99 exceeds the
  database-bottleneck threshold.
- The audit must record that WSL relieves the local unlimited 6200 socket
  pressure before selecting WSL for high-concurrency edge evidence.
- Docker must remain smoke evidence while its same-concurrency P99 is inflated
  above the selected low-tail runtime by the current threshold.

## Acceptance Criteria

- Focused tests prove Local Go is selected for the current low-tail 5800
  profile.
- Focused tests prove WSL Go is selected for the current practical
  high-concurrency edge profile.
- Focused tests prove the WSL 30000-concurrency pass is recorded as functional
  burst evidence, not low-tail promotion.
- Focused tests prove missing source reports fail readiness.
- Focused tests prove WSL edge selection fails without same-concurrency socket
  pressure relief.
- Focused tests prove high `db.acquire` P99 prevents runtime attribution.
- `npm run audit:conversation-loadgen-runtime` passes.
- `npm run test:tools`, `npm run audit:performance-evidence`, and
  `npm run quality` pass.

## Rollback

Remove the loadgen runtime audit script, tests, quality-gate command, current
report, and performance-evidence registry entry. Existing benchmark JSON
reports remain available for manual review.

## Observability And Performance Evidence

The audit report records:

- source benchmark report paths;
- executor, concurrency, gateway count, max connections per host, warm
  connection count, status, errors, first error, RPS, P95, P99, server P99,
  client/server gap P99, DB acquire P99, and DB insert P99;
- selected low-tail runtime;
- selected practical high-concurrency runtime;
- selected functional burst ceiling;
- Docker tail-inflation ratio relative to the selected low-tail runtime;
- next recommended experiment or promotion guard.
