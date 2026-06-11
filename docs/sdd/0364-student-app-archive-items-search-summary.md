# SDD 0364: Student App Archive Item Count-Only Search Summary

## Problem

SDD 0315 added safe title/tag search for `GET /v1/student-app/archive-items`.
That path is correct for showing material cards, but the Student App home screen
also needs a lighter query shape: badge counts by archive material type after
the same own-student search filter.

Using the list endpoint for count-only UI loads published archive rows, sorts
them, builds safe metadata cards, and serializes `data` plus `pageInfo`. That is
unnecessary read amplification for high-frequency home-screen refreshes.

## Scope

This slice adds `GET /v1/student-app/archive-items/summary`.

The endpoint returns only:

```json
{
  "summary": {
    "totalCount": 7,
    "quizCount": 1,
    "paperCount": 1,
    "handoutCount": 3,
    "homeworkCount": 2
  }
}
```

The domain owns Student App authorization, own-student scoping, material type
validation, query normalization, and safe count aggregation. The use case calls
a count-only reader, and PostgreSQL executes a grouped count against published
student archive materials while retaining the `teaching_archive_publications`
visibility projection.

This slice does not change the write path, database schema, Redis/shared cache,
OCR/RAG, semantic retrieval, model execution, Swarm, archive detail reads, list
pagination, or result publishing.

## Contracts

1. Only authenticated Student App own-student principals may read the summary.
2. The response contains `summary` only; it does not contain `data`, `pageInfo`,
   archive item IDs, content refs, publication IDs, worker IDs, internal errors,
   prompts, model output, OCR/RAG chunks, or Swarm state.
3. `materialType=TEACHING_MATERIAL` is rejected because this endpoint is scoped
   to student archive materials only.
4. Search text is normalized at the domain boundary and uses the same safe
   title/tag metadata search semantics as the published archive item list.
5. The repository must aggregate by material type in PostgreSQL and must not
   select full archive rows for this endpoint.
6. The endpoint uses private conditional cache headers so repeated badge reads
   can return `304 Not Modified` without a JSON body.

## Acceptance Criteria

- Domain tests prove own-student scoping, unsupported material rejection, and
  material-count summary mapping.
- Use-case tests prove the summary path calls the count-only reader and rejects
  forbidden principals before repository access.
- PostgreSQL tests prove a count-only grouped query with no list pagination or
  full-row archive projection.
- HTTP tests prove `/summary` returns a count-only safe response, supports
  private conditional 304, and does not leak list/internal fields.
- OpenAPI documents `/v1/student-app/archive-items/summary` and keeps the
  summary-only response schema in a separate schema file so the root contract
  stays below the quality headroom.
- Structure verification tracks the SDD, OpenAPI path, use case, SQL test, and
  HTTP path so the slice cannot silently disappear.

## Performance Note

This is a targeted read-path optimization, not a new whole-system production10k
benchmark. It removes row/card serialization from a home-screen badge use case
and moves counting to `SELECT material_type, COUNT(*) GROUP BY material_type`
under the existing published-visibility projection.

Current whole-system performance evidence remains `22,435.1 read/write RPS`,
`P99 44.44ms`, `0 errors`; 50ms P99 is the current pass line, while 10ms P99
remains the aspirational production target.

## Rollback

Remove the `/v1/student-app/archive-items/summary` OpenAPI path, response
schema file, domain input/count builder, count-only use case, PostgreSQL
grouped count method, HTTP route/handler/ETag, tests, 0364 SDD entry,
structure-verifier entries, and architecture-board note.
