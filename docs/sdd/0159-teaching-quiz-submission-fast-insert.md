# SDD 0159: Teaching Quiz Submission Fast Insert

## Problem

P65 moved the full mixed workload max P99 from Identity to Teaching Archive.
The Teaching Archive child report shows `createQuizSubmission` at `2413ms`
P99, above `createArchiveItem` at `1539ms` and `listArchiveItems` at `778ms`.

The current quiz submission use case reads the full archive item, authorizes it,
then inserts the submission. Under the benchmark's single Teaching DB connection
profile, that success path performs two database round trips and queues behind
other archive operations.

## Scope

In scope:

- Keep the public HTTP contract and domain authorization semantics unchanged.
- Preserve exact missing/non-quiz error behavior by falling back to the current
  read-then-write path when the fast conditional insert does not match a row.
- Add an optional repository fast path for already-authorized teaching quiz
  submissions.
- Use one parameterized `INSERT ... SELECT ... WHERE` statement to verify the
  archive item exists and is a teaching quiz before writing the submission.
- Record focused tests and performance evidence without root SLO promotion.

Out of scope:

- Schema changes.
- New caches, queues, or dependencies.
- Optimizing scanned quiz submissions in the same change.
- Claiming full-system ultra-concurrency support.

## Contracts

`CreateQuizSubmission.Execute` keeps the same input, output, and error contract.
Internally, repositories may implement:

```go
CreateQuizSubmissionForExistingTeachingQuiz(ctx, submission) (bool, error)
```

The boolean reports whether the conditional insert matched an existing
`TEACHING`/`QUIZ` archive item. A `false` result is not returned directly to
callers; the use case falls back to the existing archive lookup path so missing
archive items and non-quiz archive items continue to produce their prior domain
errors.

## Acceptance Criteria

- Focused use-case tests prove the authorized success path can skip
  `GetByID`.
- Focused use-case tests prove a fast-path miss falls back to the old
  validation path.
- Postgres adapter tests prove the new SQL is parameterized and checks
  `owner_type` and `material_type`.
- Teaching Archive tests pass.
- `npm run verify:structure`, `npm run quality`, and `git diff --check` remain
  passable.
- Post-change Teaching Archive benchmark evidence is recorded before comparing
  against P65.

## Rollback

Remove the optional fast repository branch in the use case and delete the
Postgres conditional insert method. The existing `GetByID` plus
`CreateQuizSubmission` path remains the fallback and can carry all traffic.
