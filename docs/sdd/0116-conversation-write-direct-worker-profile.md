# SDD 0116: Conversation Write Direct Worker Profile

## Problem

SDD 0115 showed that local ingress fan-out can raise the zero-error Research
conversation write capacity to 2800 concurrency, but it also raises P95 above
the SDD 0001 500ms target. The next optimization should therefore test whether
more direct gateway workers can raise the low-latency pass point without adding
proxy hops.

The first eight-gateway probe also exposed a benchmark artifact: warming all
gateway hosts at once can create a local connection storm before the measured
write phase starts. The benchmark must warm each target host independently so
the evidence reflects steady write-path behavior instead of startup pressure.

## Source Requirement References

- Root requirement: the packaged application must be efficient, stable, and
  suitable for high-concurrency teaching and research workflows.
- SDD 0001: Research conversation creation remains the first measured Go
  hot-path migration candidate.
- SDD 0115: ingress improves zero-error capacity but not low-latency P95.

## Scope

In scope:

- Change the Research conversation HTTP benchmark warm-up from all-hosts-at-once
  to per-host parallel warm-up.
- Record the warm-up strategy in benchmark `transportProfile` metadata.
- Promote a direct eight-gateway current pass point only when it stays below
  the 500ms P95 target with zero createConversation errors.
- Keep PgBouncer, PostgreSQL, schema, domain, use case, and gateway DB pool
  settings unchanged.
- Update the PgBouncer connection-budget profile so the direct eight-gateway
  claim reserves 64 conversation gateway DB clients explicitly.

Out of scope:

- Retrying non-idempotent conversation writes.
- Promoting ingress as the production default.
- Increasing PgBouncer or PostgreSQL server capacity.
- Migrating unrelated Research, RAG, training, OCR, or model-worker paths.

## Contracts Touched

- `services/conversation-write-gateway/cmd/httpbench` records the warm-up
  strategy and warms one target host at a time.
- `tools/run-conversation-write-benchmark.mjs` preserves the transport warm-up
  strategy in generated reports.
- `contracts/ops/performance-evidence-registry.current.json` moves the current
  low-latency Research write claim to the direct eight-gateway profile.

## Acceptance Criteria

- Go benchmark tests prove that warm-up is per-host parallel, not all-hosts
  parallel.
- Runner tests preserve `warmConnectionStrategy` metadata.
- Direct eight-gateway 2600-concurrency evidence passes with 0 errors and P95
  below 500ms.
- Direct eight-gateway probes above the current point are recorded as boundary
  evidence instead of silently promoted.
- PgBouncer connection-budget evidence passes with the new 64-connection
  conversation gateway budget.
- Performance evidence registry audit passes.
- `npm run quality` passes.

Current evidence update:

- Direct six-gateway 2100 remains a historical stable baseline: 5351.62 RPS,
  P95 404.20ms, 0 errors.
- Direct eight-gateway 2600 is the new current low-latency Research write
  profile: 6567.01 RPS, P95 456.37ms, 0 errors.
- Direct eight-gateway 2750 completed with 0 errors but P95 533.20ms, above the
  500ms target.
- Direct eight-gateway 2800 completed with 0 errors in a warmed run but P95
  536.07ms, so it is capacity evidence, not the low-latency current claim.
- PgBouncer connection budget remains within the explicit 300-connection
  PostgreSQL performance profile: planned 144, safe limit 190, hard limit 280.

## Rollback

Restore all-host benchmark warm-up, restore the previous 2100 current report
and registry entry, remove the direct eight-gateway reports, and remove this
SDD. Restore the PgBouncer connection-budget profile if the direct eight-gateway
claim is rolled back. No application domain or database schema rollback is
required.
