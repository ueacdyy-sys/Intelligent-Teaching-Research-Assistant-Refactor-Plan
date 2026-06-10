# SDD 0359: Student App AI Tutor Request Progress Conditional Cache

## Problem

SDD 0358 bounds the Student App polling cadence, but every permitted poll still
returns a full JSON body when the progress card has not changed. Under a large
student cohort, repeated list/detail polling can waste response-body bandwidth
and downstream body processing even when the database query itself remains
cheap.

The system needs a private conditional-read contract for AI Tutor progress so
the Student App can revalidate safely and receive `304 Not Modified` when the
visible representation is unchanged.

## Scope

This slice consumes READY SDD 0358 evidence and adds private HTTP validators to
the Student App AI Tutor progress list and single-request detail endpoints.
It does not claim to eliminate the database read or server-side JSON encoding;
the ETag is intentionally derived from the final sanitized representation at the
HTTP boundary.

## Contracts

1. Keep the existing list and single-request progress read paths.
2. For successful progress reads, return a strong response `ETag` derived from
   the final sanitized JSON representation.
3. Return `Cache-Control: private, no-cache` so Student-owned data is never a
   shared public cache object and must be revalidated before reuse.
4. Return `Vary: X-Principal-Context, X-Agent-Api-Key` so validators stay bound
   to the authenticated principal and API key context.
5. When `If-None-Match` matches the current sanitized representation, return
   `304 Not Modified` with no body.
6. Preserve all existing safety constraints: no worker ids, internal errors,
   raw result refs, internal lineage, model output, OCR/RAG data, Swarm state,
   or direct database details.
7. Do not add writes, queues, model execution, OCR/RAG, Redis, shared caching,
   or Swarm behavior.

## Acceptance Criteria

- HTTP tests prove list and detail responses expose `ETag`,
  `Cache-Control: private, no-cache`, and principal/API-key `Vary` headers.
- HTTP tests prove list and detail conditional reads return `304 Not Modified`
  with an empty body when `If-None-Match` matches.
- OpenAPI documents the 200 cache headers and 304 response for both endpoints.
- The audit emits runtime id
  `student_app_ai_tutor_request_progress_conditional_cache` with P99 <= 50ms
  and zero errors.
- Package scripts, strict quality gate, root workflow coverage,
  structure verification, root requirements trace, and architecture board track
  SDD 0359.

## Rollback

Remove this SDD, the 0359 audit/test/report, the private conditional response
helper usage from Student App AI Tutor progress handlers, OpenAPI 304/header
documentation, and the 0359 hook entries from package scripts, quality gate,
root workflow coverage, structure verification, root trace, and architecture
board. SDD 0358 server-owned polling cadence remains intact.
