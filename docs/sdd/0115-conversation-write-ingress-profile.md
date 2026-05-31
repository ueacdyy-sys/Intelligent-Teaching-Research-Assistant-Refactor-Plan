# SDD 0115: Conversation Write Ingress Profile

## Problem

SDD 0114 made the Research conversation write benchmark reproducible and moved
the current claim to a runner-managed six-gateway 2100-concurrency pass point.
The nearest 2200-concurrency probe failed with connection refusals while every
gateway process stayed alive.

That failure points at local HTTP accept/connect pressure, not PostgreSQL pool
capacity or a captured gateway crash. The next performance slice therefore
needs an explicit ingress profile before any database pool increase.

## Source Requirement References

- Root requirement: the packaged application must be efficient, stable, and
  suitable for high-concurrency teaching and research workflows.
- SDD 0001: Research conversation creation is the first measured Go hot-path
  migration candidate.
- SDD 0114: next optimization should focus on ingress fan-out or listener/socket
  diagnostics before raising database capacity.

## Scope

In scope:

- Add a Research conversation ingress proxy command that round-robins requests
  across runner-managed gateway processes.
- Keep non-idempotent `POST /v1/research/conversations` semantics simple: failed
  POST attempts return an upstream error instead of retrying against another
  gateway.
- Extend the conversation benchmark runner with explicit ingress options,
  non-overlapping port validation, and ingress report metadata.
- Run the benchmark through ingress targets without changing the use case,
  domain model, database schema, or PgBouncer settings.

Out of scope:

- Promoting a production reverse proxy.
- Retrying Research conversation writes after upstream transport errors.
- Increasing PostgreSQL, PgBouncer, or gateway DB pool budgets.
- Migrating unrelated Research, RAG, training, OCR, or model-worker paths.

## Contracts Touched

- `services/conversation-write-gateway/cmd/ingressproxy` provides the local
  ingress fan-out command for Research write-path performance evidence.
- `tools/run-conversation-write-benchmark.mjs` accepts ingress options and
  records `ingressProfile` metadata.
- `reports/conversation-write-http-benchmark.*.json` records whether the
  benchmark targeted gateways directly or ingress proxies.

## Acceptance Criteria

- Runner tests fail before implementation because ingress URL generation,
  benchmark target selection, and port-overlap validation are missing.
- The runner can target ingress URLs while still reporting gateway worker and DB
  pool metadata.
- The ingress proxy health endpoint is local to the proxy.
- POST write requests are round-robin forwarded but not retried after upstream
  transport errors.
- Focused Node and Go tests pass.
- Live PgBouncer-backed evidence is recorded for the ingress profile.
- `npm run quality` passes.

Current evidence update:

- Direct six-gateway runner remains the low-latency Research write profile:
  2100 concurrency, 5351.62 RPS, P95 404.20ms, 0 errors.
- Twelve ingress proxies moved the zero-error capacity point to 2400
  concurrency, and fourteen ingress proxies moved it to 2800 concurrency.
- The 2800 ingress pass reached 5000.22 RPS with 0 errors, but P95 was
  857.52ms, above the SDD 0001 500ms target.
- The 3600 ingress probe failed with 144 upstream errors, so the next
  optimization must focus on proxy upstream scheduling, gateway write tail
  latency, or lower-overhead listener fan-out before treating ingress as the
  production default.

## Rollback

Remove the ingress proxy command, runner ingress options, ingress-produced
reports, registry updates, and this SDD. The SDD 0114 direct gateway benchmark
runner remains usable.
