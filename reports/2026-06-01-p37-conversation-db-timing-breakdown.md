# P37 Conversation DB Timing Breakdown

## Scope

This slice follows SDD 0120. It keeps the Research conversation write contract
unchanged while splitting the server-side create timing into:

- `app`: full create use case duration.
- `db.acquire`: time waiting for a PostgreSQL pool connection.
- `db.insert`: time executing the `research_conversations` INSERT after a
  connection is acquired.

No model, OCR, RAG, vector, embedding, or training dependency was added.

## Change

- Added request-scoped conversation timing in the gateway platform layer.
- Wrapped the conversation PostgreSQL pool with a small adapter so repository
  code can measure acquire and INSERT separately.
- Added `db.acquire` and `db.insert` to the `Server-Timing` response header
  when available.
- Extended `cmd/httpbench` to preserve the existing `serverTimingMs` app summary
  and add `serverTimingBreakdownMs` / `serverTimingBreakdownSamples`.
- Raised the PgBouncer-mode conversation write evidence pool from 8 to 10
  connections per gateway worker and shaped the client transport to 280
  warmed connections per gateway host.

## Performance Evidence

Current promoted profile:

- `reports/conversation-write-http-benchmark.current.json`
- copied from
  `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-client280-db-timing-repeat.json`.
- direct 8 gateways, 3000 concurrency, 6000 operations.
- DB pool 10 per worker, total 80.
- `max-conns-per-host=280`, `warm-connections-per-host=280`,
  `warm-connection-retries=3`.
- PASSED, 6381.53 RPS, client P95 450.95ms, client P99 498.11ms, 0 errors.
- Server timing: app P95 329.13ms, app P99 331.35ms.
- DB timing: acquire P95 317.98ms, acquire P99 320.24ms, INSERT P99 29.61ms.

Supporting current-shape run:

- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-client280-db-timing.json`
- PASSED, 6307.26 RPS, client P95 450.42ms, client P99 487.45ms, 0 errors.
- DB acquire P99 326.73ms, INSERT P99 36.10ms.

Configuration probes:

- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-warm375-db-timing-repeat.json`:
  pool8/client375, PASSED, but client P95 529.03ms and DB acquire P99
  455.76ms.
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-warm375-db-timing-repeat.json`:
  pool10/client375, PASSED, client P95 520.37ms and DB acquire P99 421.72ms.
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool12-warm375-db-timing.json`:
  pool12/client375, PASSED, but regressed to client P95 585.41ms.

Boundary probes:

- `reports/conversation-write-http-benchmark.direct8-concurrency3050-multi8-pool10-client280-db-timing.json`:
  PASSED, client P95 472.70ms, client P99 541.64ms, 0 errors.
- `reports/conversation-write-http-benchmark.direct8-concurrency3100-multi8-pool10-client280-db-timing-repeat.json`:
  PASSED, but not promoted: client P95 512.55ms, client P99 548.50ms, 0
  errors.

## Current Assessment

The limiting write-path component is not the INSERT itself. At the promoted
3000 profile, INSERT P99 is 29.61ms while DB acquire P99 is 320.24ms. The
primary fix was therefore configuration-level shaping:

- raise per-gateway DB pool from 8 to 10;
- cap each gateway host at 280 warmed client connections instead of flooding
  the DB pool with the full raw concurrency share.

The current Research conversation write tail-latency claim changes from:

- 3000 concurrency, P95 493.11ms, P99 544.07ms, 6717.05 RPS,

to:

- 3000 concurrency, P95 450.95ms, P99 498.11ms, 6381.53 RPS.

This is a latency improvement with a modest throughput tradeoff, not a raw RPS
increase.

The system is now below 500ms for both P95 and P99 in the promoted repeat, but
3050/3100 remain boundary probes. The next optimization should target the
remaining end-to-end gap outside app timing and should not increase DB pool size
again without PgBouncer/PostgreSQL evidence.

## Verification

- Red phase: `go test ./services/conversation-write-gateway/... -count=1`
  failed before implementation because timing contracts were missing.
- Green phase: `go test ./services/conversation-write-gateway/... -count=1`
  passed after implementation.
- `npm run audit:performance-evidence`: required before merge-ready status.
- `npm run quality`: required before merge-ready status.

Post-run cleanup is required before merge:

- residual `bench conversation %` rows must be 0;
- Docker performance containers must be stopped;
- conversation benchmark JSON reports must not contain raw PostgreSQL DSNs or
  local secret values.
