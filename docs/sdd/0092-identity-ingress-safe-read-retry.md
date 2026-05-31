# SDD 0092: Identity Ingress Safe Read Retry

## Problem

The current Identity HTTP evidence passes at 3000 logical concurrent clients
and fails at the nearest 3200 probe during `principalLookup` with ingress
`502 upstream unavailable` responses. The failed phase is a read-only HTTP GET
against `/v1/identity/principal`, after the benchmark already completed the
login write phase.

The ingress proxy currently selects one gateway worker and returns 502 on the
first upstream transport error. That keeps mutation semantics simple, but it
also turns transient gateway/upstream connection pressure into visible read
path failures even when another gateway worker may be available.

## Source Requirement References

- Root requirement: teacher, student, and remote entry points need a stable
  shared identity boundary.
- SDD 0008: durable sessions must support shared workers and token lifecycle
  correctness.
- SDD 0012: HTTP gateway benchmarks provide client-facing Identity performance
  evidence.
- SDD 0090: refresh rotation moved to a one-round-trip database path.
- SDD 0091: the current local profile is 3000 pass and 3200 fail; the failed
  3200 probe fails in `principalLookup` with ingress 502s.

## Scope

In scope:

- Add bounded retry for idempotent ingress methods `GET` and `HEAD` when the
  selected upstream returns a transport error before any response is produced.
- Retry another gateway worker at most once per configured upstream.
- Preserve existing round-robin load distribution for first attempts.
- Keep mutation methods such as `POST` and `DELETE` single-attempt to avoid
  duplicate session creation, refresh rotation, or revocation effects.
- Keep `npm test` Docker-free.

Out of scope:

- Retrying application-level HTTP status responses.
- Retrying request bodies that cannot be safely replayed.
- Changing public Identity HTTP contracts.
- Changing token TTLs, session semantics, database schema, PostgreSQL limits,
  PgBouncer limits, or gateway worker count.
- Introducing Redis, external caches, model dependencies, OCR, RAG, vector
  databases, embeddings, or training dependencies.

## Contracts

- `GET` and `HEAD` requests may be retried only after a transport error.
- `POST`, `PUT`, `PATCH`, and `DELETE` requests are not retried by ingress.
- If all safe read attempts fail, ingress still returns HTTP 502.
- Proxy headers keep the original forwarded host/protocol across retry
  attempts.

## Acceptance Criteria

- A focused Go test fails before implementation because a GET upstream
  transport error is not retried against another upstream.
- A focused Go test proves POST upstream transport errors are not retried.
- Focused ingress proxy tests pass after implementation.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.
- If live Docker performance evidence is collected, the 3200 probe is rerun
  with the same worker and pool profile before claiming a new boundary.

## Rollback

Remove SDD 0092, the ingress retry transport, focused ingress tests, and any
new live benchmark evidence or registry entries. SDD 0091 remains the current
3000-pass/3200-fail boundary evidence.

## Observability And Performance Evidence

Record:

- Red focused ingress proxy test before implementation.
- Focused ingress proxy test after implementation.
- Optional live Identity HTTP rerun for the existing 3200 profile.
- `npm test` and `npm run quality` results.
