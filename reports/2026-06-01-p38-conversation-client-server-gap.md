# P38 Conversation Client Server Gap

## Scope

This slice follows SDD 0121. It keeps the Research conversation write API and
gateway runtime unchanged while making the benchmark report distinguish:

- end-to-end client latency;
- server-side `app` timing;
- derived client/server gap for the same operation.

No model, OCR, RAG, vector, embedding, or training dependency is added.

## Change

- Added `clientServerGapMs` and `clientServerGapSamples` to the Go HTTP
  benchmark phase report.
- Kept existing `latencyMs`, `serverTimingMs`, and
  `serverTimingBreakdownMs` fields unchanged.
- Copied the strongest repeatable 2900-concurrency gap run to
  `reports/conversation-write-http-benchmark.current.json`.
- Reclassified 3000 concurrency as a P99 boundary probe under the current
  machine state.

## Performance Evidence

Current promoted profile:

- `reports/conversation-write-http-benchmark.current.json`
- copied from
  `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-gap-repeat.json`.
- direct 8 gateways, 2900 concurrency, 5800 operations.
- DB pool 10 per worker, total 80.
- `max-conns-per-host=272`, `warm-connections-per-host=272`,
  `warm-connection-retries=3`.
- PASSED, 6559.42 RPS, client P95 425.85ms, client P99 467.33ms, 0 errors.
- Server timing: app P99 326.99ms.
- DB timing: acquire P99 316.57ms, INSERT P99 40.06ms.
- Client/server gap: P95 115.40ms, P99 141.55ms, 5800 paired samples.

Supporting 2900 repeat:

- `reports/conversation-write-http-benchmark.direct8-concurrency2900-multi8-pool10-client272-gap.json`
- PASSED, 6507.48 RPS, client P95 437.55ms, client P99 483.03ms, 0 errors.
- DB acquire P99 308.51ms, INSERT P99 30.15ms.
- Client/server gap P99 168.36ms.

3000 boundary probes:

- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-client280-gap-repeat2.json`
- PASSED, 6468.90 RPS, client P95 453.40ms, client P99 503.35ms, 0 errors.
- DB acquire P99 312.67ms, client/server gap P99 191.00ms.
- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-client280-gap-repeat3.json`
- PASSED, 6549.81 RPS, client P95 464.83ms, client P99 510.18ms, 0 errors.
- DB acquire P99 328.60ms, client/server gap P99 173.54ms.

Cold-state negative evidence:

- `reports/conversation-write-http-benchmark.direct8-concurrency3000-multi8-pool10-client280-gap-repeat.json`
- PASSED with 0 errors, but regressed to client P95 914.09ms and P99
  952.73ms immediately after starting Docker.
- DB acquire P99 was 709.54ms and client/server gap P99 was 404.33ms.
- This report is not promoted; it proves that current performance claims are
  sensitive to runtime warm state.

## Current Assessment

The current repeatable low-latency claim should be 2900 concurrency, not 3000.
The 3000-concurrency profile still works functionally, but two warm repeats
crossed the P99 500ms target. The new per-operation gap shows the tail is a
mix:

- server-side DB acquire remains the largest component at P99;
- client/server gap still contributes roughly 140-190ms at P99 near the
  boundary;
- INSERT time remains much smaller than DB acquire and is not the primary
  limiter.

The next optimization should therefore keep DB pool 10 as the current evidence
shape and target one of:

- reducing DB acquire queueing without increasing total PostgreSQL pressure;
- reducing client/server gap through transport/listener/proxy scheduling;
- or testing a lower-overhead ingress/fan-out profile before raising the
  concurrency claim again.

## Verification

- Red phase: `go test ./services/conversation-write-gateway/cmd/httpbench -run TestBuildPhaseReportIncludesClientServerGap -count=1` must fail before implementation.
- Green phase: `go test ./services/conversation-write-gateway/cmd/httpbench -run TestBuildPhaseReportIncludesClientServerGap -count=1` passed after implementation.
- `go test ./services/conversation-write-gateway/... -count=1` passed.
- `npm run audit:performance-evidence`: required before merge-ready status.
- `npm run quality`: required before merge-ready status.

Post-run cleanup is required before merge:

- residual `bench conversation %` rows must be 0;
- Docker performance containers must be stopped;
- conversation benchmark JSON reports must not contain raw PostgreSQL DSNs or
  local secret values.
