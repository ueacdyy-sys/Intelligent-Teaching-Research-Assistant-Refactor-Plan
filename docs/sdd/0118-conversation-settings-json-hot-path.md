# SDD 0118: Conversation Settings JSON Hot Path

## Problem

The Research conversation write gateway currently validates `settings` by
decoding JSON into `map[string]any`, then the PostgreSQL adapter marshals the
same data back to JSON before insert. This adds avoidable CPU work and
allocations on the measured write hot path.

The root product requires efficient, stable high-concurrency Research
conversation workflows. SDD 0117 showed the current bottleneck is now local
connection shaping and high-load tail variance rather than PostgreSQL waits, so
the next safe application-level optimization is to remove duplicate JSON work
without changing the HTTP contract or database schema.

## Source Requirement References

- Root requirement: Research mode is a conversation-first assistant that must
  run efficiently under high-concurrency teaching and research workflows.
- SDD 0001: Research conversation creation is the first Go hot-path migration
  candidate, with P95 below 500ms and 0 failures under the chosen budget.
- SDD 0117: direct eight-gateway 2800 is the current low-latency point; further
  gains should target connection shaping and hot-path overhead before changing
  PostgreSQL durability.

## Scope

In scope:

- Represent validated conversation settings as raw JSON bytes inside the
  Research write domain.
- Validate `settings` as JSON object or `null` at the HTTP boundary.
- Preserve exact raw JSON for PostgreSQL `jsonb` insert instead of remarshal.
- Preserve response contract shape: object settings are returned as JSON
  objects; missing or `null` settings are omitted.
- Keep baseline runtime dependencies unchanged.

Out of scope:

- Changing the `research_conversations` table schema.
- Accepting non-object settings.
- Changing conversation IDs, title rules, event semantics, or rollback route.
- Claiming a new concurrency ceiling without fresh benchmark evidence.

## Contracts Touched

- `services/conversation-write-gateway/internal/domain` stores settings as
  validated raw JSON.
- `services/conversation-write-gateway/internal/adapter/httpapi` validates raw
  JSON settings at the boundary and returns raw JSON in responses.
- `services/conversation-write-gateway/internal/adapter/postgres` inserts the
  raw JSON directly through the repository port.

No OpenAPI shape change is intended.

## Acceptance Criteria

- HTTP adapter accepts object settings and returns them as an object.
- HTTP adapter rejects array, scalar, or malformed settings with
  `VALIDATION_ERROR`.
- Use-case tests still prove title normalization and event publishing without
  HTTP or PostgreSQL.
- PostgreSQL adapter tests prove the raw settings JSON reaches `$7::jsonb`
  without map remarshal.
- `go test ./services/conversation-write-gateway/...` passes.
- `npm run quality` passes before merge-ready status.

## Observability And Performance Evidence

This slice is a code-level hot-path optimization. It reduces duplicate JSON
work in every create-conversation request while keeping benchmark contracts and
reports unchanged. A new live benchmark may promote a higher current profile
only after Docker-backed evidence is generated.

Current evidence update:

- The raw-settings repeat run at direct eight-gateway 2800 improved the current
  shape from 6282.99 RPS / P95 453.72ms to 6740.61 RPS / P95 449.75ms, with
  0 errors.
- Direct eight-gateway 2900 passed twice below the 500ms P95 target after the
  hot-path change: P95 476.46ms and P95 452.11ms.
- Direct eight-gateway 3000 passed twice below the 500ms P95 target: P95
  490.93ms and P95 485.30ms, with 0 errors.
- Direct eight-gateway 3100 passed functionally but crossed the target at P95
  504.66ms, so it remains the nearest latency-boundary probe.
- P99 remains above 500ms at the 3000 profile, so the next optimization should
  target high-load tail variance rather than basic write throughput.

## Rollback

Restore `domain.Settings` to `map[string]any`, restore HTTP map decoding, and
restore PostgreSQL adapter JSON marshaling before insert.
