# SDD 0366: Student App Question-Bank Draft Count-Only Summary

## Problem

`GET /v1/student-app/question-bank-drafts` is the right surface for showing
draft cards, but Student App home and badge views only need counts by source
material type. Calling the list endpoint for those views loads full draft
metadata, exposes list-shaped response fields, and serializes row-level refs
that the count-only UI does not need.

## Scope

This slice adds `GET /v1/student-app/question-bank-drafts/summary`.

The endpoint returns only:

```json
{
  "summary": {
    "totalCount": 3,
    "quizCount": 2,
    "paperCount": 0,
    "handoutCount": 1,
    "homeworkCount": 0
  }
}
```

The domain owns Student App authorization, own-student scoping, succeeded-draft
filtering, question-bank draft ref requirement, and safe material count
aggregation. The use case calls a count-only reader, and PostgreSQL executes a
grouped count by `source_archive_material`.

This slice does not change writes, schema, shared cache, model execution, OCR,
RAG, Swarm, draft content reads, answer submission, scoring, or publication.

## Contracts

1. Only authenticated Student App own-student principals may read the summary.
2. The response contains `summary` only; it does not contain `data`, `pageInfo`,
   tutoring request IDs, archive item IDs, `resultRef`, `questionBankDraftRef`,
   student IDs, worker IDs, internal errors, prompts, model output, OCR/RAG
   chunks, or Swarm state.
3. Only `SUCCEEDED`, student-owned tutoring analysis requests with
   `question_bank_draft_ref IS NOT NULL` are counted.
4. `TEACHING_MATERIAL` and unknown material types are rejected at the domain
   boundary because this endpoint is scoped to student archive materials only.
5. The repository must aggregate in PostgreSQL with
   `source_archive_material, COUNT(*) GROUP BY source_archive_material` and
   must not select full tutoring request rows.
6. The endpoint uses private conditional cache headers so repeated badge reads
   can return `304 Not Modified` without a JSON body.

## Acceptance Criteria

- Domain tests prove own-student scoping, forbidden-principal rejection,
  material-count summary mapping, and unsafe count rejection.
- Use-case tests prove the summary path calls the count-only reader and rejects
  forbidden principals before repository access.
- PostgreSQL tests prove a count-only grouped query with no list pagination or
  full-row tutoring request projection.
- HTTP tests prove `/summary` returns a count-only safe response, supports
  private conditional 304, rejects unsupported methods, and does not leak
  list/internal fields.
- OpenAPI documents `/v1/student-app/question-bank-drafts/summary` and keeps
  the summary-only response schema in a separate schema file.
- Structure verification tracks the SDD, OpenAPI path/schema, use case, SQL
  test, and HTTP presenter/validator so the slice cannot silently disappear.

## Performance Note

This is a targeted read-path optimization, not a new whole-system production10k
benchmark. It removes row/card serialization from a Student App badge use case
and moves counting to `SELECT source_archive_material, COUNT(*) GROUP BY
source_archive_material` under the existing own-student draft scope.

Current whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99
remains the aspirational production target.

## Rollback

Remove the `/v1/student-app/question-bank-drafts/summary` OpenAPI path,
response schema file, domain input/count builder, count-only use case,
PostgreSQL grouped count method, HTTP route/handler/ETag, tests, 0366 SDD
entry, structure-verifier entry, and architecture-board note.
