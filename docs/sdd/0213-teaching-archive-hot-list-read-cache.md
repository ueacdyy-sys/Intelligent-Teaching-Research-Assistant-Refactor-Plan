# SDD 0213: Teaching Archive Hot List Read Cache

## Problem

The Teaching Archive production10k worker profile improved synchronous write
tail latency, but the current Docker Teaching benchmark still shows
`listArchiveItems` as a read-side bottleneck:

- P99: 112.15ms.
- App P99: 96.13ms.
- `db.acquire` P99: 86.10ms.
- `db.query` P99: 95.75ms.

The benchmark phases run sequentially, so this list tail is not caused by
simultaneous archive writes. It is mostly connection queueing from hundreds of
identical hot list reads contending for a small per-gateway PostgreSQL pool.
Raising the pool from 12 to 24 did not solve the tail and worsened the maximum
P99 in prior evidence.

## Scope

- Add a configurable, in-process Teaching Archive list read cache for hot,
  already-authorized archive list queries.
- Coalesce concurrent cold misses for the same scoped query with singleflight
  behavior so a burst of identical reads produces one PostgreSQL query per
  gateway per TTL window.
- Keep the cache disabled by default and enable it only in the production10k
  performance profile until Root SLO evidence proves the tradeoff is useful.
- Emit cache hit/shared-wait `Server-Timing` signals so future reports can
  distinguish database reads from cache-served reads.
- Extend benchmark reports with an explicit Teaching read profile.

## Non-Scope

- Claiming all Teaching reads are under 50ms before Docker/WSL evidence proves
  it.
- Caching write paths, quiz submission writes, or AI grading/tutoring job
  mutation paths.
- Adding Redis, Kafka, vector stores, model-serving, or training dependencies.
- Replacing PostgreSQL as the durable source of truth.
- Providing cross-gateway strong read-your-write semantics in this slice.

## Design

The cache wraps the `ArchiveReader` port used by Teaching list use cases. It is
an outer adapter detail: use cases still depend on the same `ArchiveReader`
interface, and PostgreSQL remains the authoritative store.

Cache keys are built from the scoped `ArchiveItemQuery`, after domain
authorization has already constrained owner, student, material, page size,
fetch limit, cursor, and assigned student IDs. This prevents broader principal
input from leaking data across authorization scopes.

The cache stores short-lived copies of archive item pages. On a cache miss, the
first request queries the wrapped reader. Concurrent requests for the same key
wait for that in-flight result instead of entering PostgreSQL independently.

Configuration:

```text
TEACHING_ARCHIVE_LIST_CACHE_TTL_MS=0      # disabled by default
TEACHING_ARCHIVE_LIST_CACHE_MAX_ENTRIES=1024
```

The production10k scale-up profile sets:

```text
teachingArchiveListCacheTtlMs=250
teachingArchiveListCacheMaxEntries=4096
```

This intentionally chooses a short TTL. It targets dashboard/list bursts while
keeping cross-gateway staleness bounded without introducing Redis or a message
bus in the baseline.

## Contracts

The public HTTP contract remains unchanged:

```http
GET /v1/teaching/archive-items
200 OK
```

Successful Teaching responses may include these additional `Server-Timing`
metrics:

```text
cache.hit
cache.shared_wait
```

Benchmark reports include:

```json
"gatewayReadProfile": {
  "archiveListCacheEnabled": true,
  "archiveListCacheTtlMs": 250,
  "archiveListCacheMaxEntries": 4096
}
```

## Acceptance Criteria

- Go tests prove concurrent identical list cache misses are coalesced into one
  wrapped reader call.
- Go tests prove scoped query differences produce separate cache keys.
- Go tests prove cached items are copied before returning to callers.
- Gateway tests prove cache configuration is disabled by default and enabled by
  TTL configuration.
- Tool tests prove the Teaching benchmark and system scale-up runners pass and
  report the read-cache profile.
- `npm run quality` stays green.
- Docker Teaching benchmark evidence records whether list `db.acquire`,
  `db.query`, app P99, and total P99 improved.

## Rollback

Set `TEACHING_ARCHIVE_LIST_CACHE_TTL_MS=0` or
`teachingArchiveListCacheTtlMs=0` in the benchmark profile. The wrapper is then
not used and the list path returns to direct PostgreSQL reads.
