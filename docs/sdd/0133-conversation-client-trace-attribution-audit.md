# SDD 0133: Conversation Client Trace Attribution Audit

## Problem

SDD 0126 added opt-in client-side `httptrace` diagnostics to the Research
conversation write benchmark. The trace report shows that the remaining
end-to-end latency gap is mostly outside PostgreSQL pool acquisition and
application `Server-Timing`.

That evidence is currently easy to misread because it sits in a raw benchmark
JSON report. The refactor needs a machine-readable attribution audit before
the next performance change. Otherwise future slices may keep changing worker
fanout or database pool settings when the evidence points to client transport,
listener scheduling, or pre-handler delay.

## Source Requirement References

- Root requirement: Research mode must keep conversation persistence stable and
  efficient under high-concurrency teaching and research workflows.
- Root requirement: baseline runtime and package size must remain small; no
  model, OCR, RAG, vector, embedding, training, or external tracing dependency
  may be added for this diagnostic.
- SDD 0121: client/server gap must be derived per operation before assigning
  the next bottleneck.
- SDD 0126: client trace diagnostics split the gap into transport wait,
  request write, first-byte app gap, response body read, and round trip.
- SDD 0132: direct16 remains the current promoted fanout, so the next
  optimization should investigate the gap source instead of adding workers.

## Scope

In scope:

- Add a Docker-free Node audit over the current client-trace benchmark report.
- Classify the dominant client-side gap components from
  `clientTraceBreakdownMs`.
- Verify the source report includes `clientServerGapMs`, `Server-Timing`
  breakdown, and complete trace sample coverage.
- Verify `db.acquire` P99 stays below the database-bottleneck threshold before
  recommending transport or listener diagnostics.
- Generate a current attribution report and register it as performance
  evidence.

Out of scope:

- Running a new benchmark.
- Changing the Research conversation API, gateway code path, schema, PgBouncer,
  PostgreSQL, worker fanout, or batching behavior.
- Adding external tracing infrastructure or new runtime dependencies.
- Claiming full-system sustained capacity from a single conversation write
  diagnostic report.

## Contracts

- `npm run audit:conversation-client-trace-attribution` writes
  `reports/conversation-client-trace-attribution.current.json`.
- The audit returns `READY` only when the source trace report is present,
  parseable, and includes:
  - `clientServerGapMs`;
  - `serverTimingBreakdownMs.app`;
  - `serverTimingBreakdownMs.db.acquire`;
  - `clientTraceBreakdownMs.client.transport_wait`;
  - `clientTraceBreakdownMs.client.first_byte_app_gap`;
  - trace sample counts matching operation count for required trace metrics.
- The attribution must not hard-code the current answer. If a future report is
  dominated by response body read, request write, or database acquisition, the
  classification must change.

## Acceptance Criteria

- Focused tests prove the current client-trace evidence classifies as
  transport plus pre-handler/listener gap, not database acquisition.
- Focused tests prove a missing or non-trace report fails readiness.
- Focused tests prove high `db.acquire` P99 prevents transport attribution.
- Focused tests prove a different dominant trace component changes the
  attribution.
- `npm run audit:conversation-client-trace-attribution` passes.
- `npm run test:tools` passes.
- `npm run audit:performance-evidence` passes after registry updates.
- `npm run quality` passes before merge-ready status.

## Rollback

Remove the attribution audit script, its tests, quality-gate step, generated
current report, and performance registry entry. SDD 0126 client-trace
instrumentation remains available for manual report inspection.

## Observability And Performance Evidence

The generated audit report records:

- source trace report path;
- concurrency, gateway count, transport profile, and operation count;
- end-to-end P99, server app P99, client/server gap P99, `db.acquire` P99, and
  `db.insert` P99;
- client trace component P99 values and gap ratios;
- dominant attribution and recommended next diagnostic action.
