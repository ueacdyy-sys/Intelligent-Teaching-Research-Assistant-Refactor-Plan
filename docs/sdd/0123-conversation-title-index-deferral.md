# SDD 0123: Conversation Title Index Deferral

## Problem

SDD 0122 proved that the current Research conversation write ceiling is dominated
by DB pool acquisition wait. The write path still maintains a title index even
though the current Go hot slice only creates conversations and exposes no title
lookup contract.

That index is future-facing, not current behavior. Keeping it in the fresh
write-gateway schema adds write amplification to the hottest path before the
access pattern exists.

## Source Requirement References

- Root requirement: Research mode must remain conversation-first and stable
  under high-concurrency teaching and research workflows.
- Root requirement: runtime and package size must stay small, efficient, and
  easy to verify.
- SDD 0001: this hot slice only creates research conversations.
- SDD 0122: DB acquisition wait is the current bottleneck; blind pool increases
  and client cap changes were negative probes.

## Scope

In scope:

- Serialize fresh schema initialization with a single-connection,
  transaction-scoped advisory lock so multi-worker cold starts can create the
  reduced schema safely through PgBouncer transaction pooling.
- Stop creating `ix_research_conversations_title` in the fresh conversation
  write-gateway schema.
- Keep the `title` column and all request/response validation unchanged.
- Keep `ix_research_conversations_updated_at`, because recent-conversation list
  access is a likely read-model path.
- Update the SQL contract to match the write-gateway schema.
- Benchmark the same current profile on a reset Docker performance database so
  the fresh schema does not carry the deferred title index.

Out of scope:

- Dropping title indexes from existing databases at gateway startup.
- Adding a title search/read endpoint.
- Changing public OpenAPI, IDs, timestamps, settings, or rollback route.
- Removing `updated_at` index.
- Adding caches, queues, model dependencies, OCR, RAG, vectors, embeddings, or
  training dependencies.

## Contracts Touched

- `EnsureSchema` acquires one database connection, starts a transaction, takes a
  PostgreSQL transaction-scoped advisory lock, creates the schema, and commits.
- Fresh `research_conversations` schema contains the primary key and
  `ix_research_conversations_updated_at`.
- Fresh `research_conversations` schema does not create
  `ix_research_conversations_title`.
- Existing databases may still retain the old title index until an explicit,
  reviewed migration removes it.

## Acceptance Criteria

- A focused repository test fails before implementation because the schema still
  creates `ix_research_conversations_title`.
- A focused repository test proves schema initialization uses a transaction
  advisory lock on one acquired connection before DDL.
- The repository schema test passes after implementation and still proves
  `updated_at` is indexed.
- `go test ./services/conversation-write-gateway/internal/adapter/postgres -count=1`
  passes.
- A Docker-backed current-profile benchmark runs against a reset performance DB
  and records both performance and the fresh index list.
- `npm run quality` passes before merge-ready status.

## Observability And Performance Evidence

Record:

- `reports/2026-06-01-p40-conversation-title-index-deferral.md`
- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-title-index-deferred.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-title-index-deferred-repeat.json`
- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-title-index-deferred-repeat2.json`

## Rollback

Restore `ix_research_conversations_title` in the SQL contract and Go schema
statements, then rerun the current conversation write benchmark.
