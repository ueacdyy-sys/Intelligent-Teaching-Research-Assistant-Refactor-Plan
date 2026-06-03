# SDD 0198: Teaching SQL Contract Index Trim

## Problem

SDD 0197 removed three redundant Teaching Archive item indexes from the Go
runtime schema to reduce write amplification on the hot `createArchiveItem`
path. The checked-in SQL contract still recreated those same indexes:

- `idx_teaching_archive_items_student_created`
- `idx_teaching_archive_items_owner_created`
- `idx_teaching_archive_items_material_created`

That contract drift can reintroduce the exact write-path cost that the
production 10k evidence identified as the slowest Teaching phase.

## Scope

- Update `contracts/sql/teaching-archive.sql` so it drops the redundant archive
  item indexes.
- Keep the covered `(filter, created_at DESC, id DESC)` page indexes required
  by list queries.
- Add a Node contract test that fails if the SQL contract recreates the
  redundant indexes or loses the page indexes.

## Non-Goals

- Claiming that index trimming alone satisfies the Root interactive P99 target.
- Changing immutable root requirements.
- Adding model, OCR, RAG, vector database, training, Mem0, Milvus, vLLM, SFT,
  RL, or FP8 dependencies to the baseline.

## Contracts

- The SQL contract must execute `DROP INDEX IF EXISTS` for each redundant
  archive item write index.
- The SQL contract must not execute `CREATE INDEX IF NOT EXISTS` for those
  redundant index names.
- The SQL contract must continue to create the covered page indexes used by
  archive item list queries.
- The Go runtime schema and SQL contract must express the same archive item
  index policy.

## Acceptance Criteria

- `node --test tools/teaching-archive-sql-contract.test.mjs` fails before the
  SQL contract change and passes after it.
- The SQL contract drops the three redundant archive item indexes.
- The SQL contract retains `idx_teaching_archive_items_created_page`,
  `idx_teaching_archive_items_student_page`,
  `idx_teaching_archive_items_owner_page`, and
  `idx_teaching_archive_items_material_page`.
- Existing quality gates stay green.

## Rollback

Restore the three redundant archive item indexes in both the SQL contract and
runtime schema. That rollback may improve compatibility with older manual SQL
setup expectations, but it reintroduces write amplification on the Teaching
Archive create path.
