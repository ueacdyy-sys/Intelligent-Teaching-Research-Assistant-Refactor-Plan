# SDD 0194: Identity Query Row Pool Attribution

## Problem

Identity remains the largest root interactive tail-latency blocker in the
current production 10k review. The session store already attributes measured
pool acquire and database execution time for write operations, but principal
lookup and `RotateRefreshSession` still record only total elapsed time when they
use `QueryRow`.

That leaves an important blind spot for the next Docker/WSL multi-worker run:
when Identity becomes slow, the report cannot reliably say whether read-like
session operations are waiting on the pool, spending time in PostgreSQL, or only
waiting in application code.

## Scope

In scope:

- Add an optional measured `QueryRow` database interface beside the existing
  measured `Exec` interface.
- Teach the PostgreSQL pool adapter to measure `QueryRow` pool acquire and scan
  execution time.
- Record measured breakdowns for `getPrincipalByAccessToken`,
  `getPrincipalByRefreshToken`, and `rotateRefreshSession`.
- Keep row affected counters limited to `Exec` operations.

Out of scope:

- Changing session semantics, token format, revoke behavior, cache TTL, or
  identity public API responses.
- Claiming that Identity tail latency is fixed.
- Adding Redis, model, OCR, RAG, vector, embedding, training, Mem0, Milvus,
  vLLM, SFT, RL, or FP8 dependencies to the baseline.

## Contracts

Database adapters may implement:

```go
type MeasuredQueryRowDB interface {
    QueryRowMeasured(ctx context.Context, sql string, args ...any) MeasuredQueryRow
}
```

When implemented, session operation timing stats include pool and DB execution
breakdown for query-row operations:

```json
{
  "sessionOperations": {
    "getPrincipalByAccessToken": {
      "poolAcquireCount": 1,
      "poolAcquireElapsedMs": 4,
      "dbExecuteElapsedMs": 5
    }
  }
}
```

## Acceptance Criteria

- Existing `ExecMeasured` behavior and write row-count attribution are
  unchanged.
- `GetPrincipalByAccessToken` records measured pool acquire and DB execution
  time when the DB implements measured query rows.
- `GetPrincipalByRefreshToken` records the same breakdown.
- `RotateRefreshSession` records the same breakdown.
- Query-row operations do not report row affected counters.
- Focused Go tests for the session store pass.
- Full quality gate remains green after the report refresh.

## Rollback

Remove the measured `QueryRow` interface, the pool adapter wrapper, and the
session-store calls to the measured helper. Query-row operations will continue
to record total elapsed time only.
