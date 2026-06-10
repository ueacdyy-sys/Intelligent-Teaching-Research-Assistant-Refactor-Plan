# SDD 0360: Student App AI Tutor Request Progress Pre-Encode Validator

## Problem

SDD 0359 added private conditional reads for Student App AI Tutor progress, but
the 304 decision still happened after the server encoded the full sanitized JSON
body. That is correct for privacy and representation safety, but it leaves a
CPU and allocation cost on every unchanged mobile polling request.

The system needs a pre-encode validator for the safe progress representation so
matching `If-None-Match` requests can return `304 Not Modified` before response
DTO mapping and JSON response encoding.

## Scope

This slice consumes READY SDD 0359 evidence and moves the conditional-read check
one step earlier in the HTTP adapter. The validator is derived from the already
sanitized progress card fields and list page metadata. It does not skip the
use-case or database read, because the server must still authorize the student,
load the scoped request state, and construct the safe progress card before it can
know whether the visible representation is unchanged.

This slice does not add Redis, shared cache, writes, model inference, OCR/RAG,
or Swarm behavior.

## Contracts

1. Keep the existing Student App AI Tutor progress list and detail endpoints.
2. Keep private `ETag`, `Cache-Control: private, no-cache`, and
   `Vary: X-Principal-Context, X-Agent-Api-Key` behavior from SDD 0359.
3. Compute a stable validator from every visible safe progress field:
   progress identity, archive item id, analysis goal, question-bank intent,
   status, learning action source, follow-up depth, source material, progress
   stage, next action, primary action, refresh policy, safe status message,
   timeline, timestamps, and list page metadata.
4. If `If-None-Match` matches the computed validator, return `304 Not Modified`
   with no response body before building the HTTP response DTO or encoding JSON.
5. If the validator does not match, build and encode the same safe response
   shape already covered by SDD 0354-0359.
6. Preserve all existing safety constraints: no worker ids, internal errors,
   raw result refs, internal lineage, model output, OCR/RAG data, Swarm state,
   or direct database details.

## Acceptance Criteria

- Go tests prove matching `If-None-Match` returns `304 Not Modified` without
  invoking the payload factory.
- Go tests prove non-matching validators still build and encode the JSON body.
- Go tests prove the validator changes when visible fields such as `updatedAt`,
  `primaryAction.targetUrl`, timeline status, or list `pageInfo` change.
- The audit emits runtime id
  `student_app_ai_tutor_request_progress_preencode_validator` with P99 <= 50ms
  and zero errors.
- Package scripts, strict quality gate, root workflow coverage,
  structure verification, root requirements trace, and architecture board track
  SDD 0360.

## Rollback

Remove this SDD, the 0360 audit/test/report, the pre-encode validator helper,
the Student App AI Tutor progress handler calls to the precomputed validator,
and the 0360 hook entries from package scripts, quality gate, root workflow
coverage, structure verification, root trace, and architecture board. SDD 0359
private conditional reads remain valid, but matching 304 requests would again
perform server-side JSON encoding before the comparison.
