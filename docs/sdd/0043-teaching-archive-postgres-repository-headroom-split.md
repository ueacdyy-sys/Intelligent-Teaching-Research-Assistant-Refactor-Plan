# SDD 0043: Teaching Archive PostgreSQL Repository Headroom Split

## Problem

SDD 0041 and SDD 0042 restored headroom for the Teaching Archive OpenAPI and HTTP adapter files. The remaining Teaching Archive hot spot is `services/teaching-archive-gateway/internal/adapter/postgres/repository.go`, which has 769 lines and mixes several reasons to change:

- PostgreSQL adapter interfaces and repository construction.
- schema migration statements.
- archive item create, get, and list SQL.
- tutoring analysis create, get, list, worker claim, and worker result SQL.
- AI grading request insert SQL.
- row scanners and query helper functions.

Future Teaching Mode slices will add more quiz, grading-result, student archive, and worker-result persistence behavior. Keeping those changes in one large repository file would again mix behavior changes with emergency quality work and make SQL review harder.

## Source Requirement References

- Root requirement: Teaching Mode includes AI grading, tutoring mode, student archives, teaching materials, and personalized learning support.
- Root requirement: archive materials include quizzes, papers, handouts, homework, and teaching materials.
- Root requirement: AI grading reserves OCR or handwriting recognition for precise scoring while baseline dependencies stay light.
- Whole-system invariant: modules are delivery slices under the full product boundary.
- SDD 0014: strict quality gate rejects oversized files and architecture boundary drift.
- SDD 0041 and SDD 0042: Teaching Archive headroom work keeps future feature slices reviewable.

## Scope

In scope:

- Split schema setup out of `repository.go`.
- Split archive item persistence out of `repository.go`.
- Split tutoring-analysis persistence out of `repository.go`.
- Split AI grading request insert persistence out of `repository.go`.
- Split archive/tutoring row scanners out of `repository.go`.
- Split small PostgreSQL helper functions out of `repository.go`.
- Add executable structure checks that require the new files and keep `repository.go` below the new headroom limit.
- Keep all SQL text, ordering, filters, claim semantics, result guard semantics, nullable conversions, and public method signatures unchanged.

Out of scope:

- New endpoints or contracts.
- SQL schema behavior changes.
- Query optimization or index changes.
- Live PostgreSQL integration runs.
- Python worker implementation.
- OCR, RAG, model, scoring, or training dependencies.
- TypeScript SDK generation.

## Contracts

Updated structure contract:

- `tools/verify-structure.mjs`

Go PostgreSQL adapter organization:

- `services/teaching-archive-gateway/internal/adapter/postgres/repository.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go`
- `services/teaching-archive-gateway/internal/adapter/postgres/repository_helpers.go`

## Acceptance Criteria

- Structure verification fails before the split because the new PostgreSQL adapter split files are missing and `repository.go` exceeds the new 180-line headroom limit.
- `repository.go` keeps only adapter interfaces, repository state, and constructor, and stays at or below 180 lines.
- `repository_schema.go` owns schema setup and schema statements.
- `repository_archive_items.go` owns archive item create, get, and list SQL.
- `repository_tutoring_analysis.go` owns tutoring-analysis create, get, list, worker claim, and worker result SQL.
- `repository_ai_grading_request.go` owns AI grading request insert SQL.
- `repository_scanners.go` owns archive item and tutoring-analysis row scanners.
- `repository_helpers.go` owns shared SQL helper functions.
- Teaching Archive PostgreSQL tests still pass without behavior changes.
- `npm test` passes.
- `npm run quality` passes.

## Rollback

Move schema setup, archive item persistence, tutoring-analysis persistence, AI grading insert persistence, scanners, and helper functions back into `repository.go`, remove SDD 0043 structure checks from `tools/verify-structure.mjs`, and delete the split files. Because this slice is behavior-preserving, rollback only changes file organization.

## Observability And Performance Evidence

Record:

- failing structure-verifier evidence before the split.
- line counts before and after the split.
- targeted Teaching Archive PostgreSQL/Go test result.
- full `npm test` result.
- strict `npm run quality` result and `reports/quality-gate.current.json` summary.
- confirmation that no OCR/RAG/model/training dependencies were added.
