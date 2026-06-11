# SDD 0367: Student App Summary Fast-Path Flow Audit

## Problem

The Student App now has three count-only home/badge fast paths:

- `GET /v1/student-app/ai-tutor-requests/summary`
- `GET /v1/student-app/archive-items/summary`
- `GET /v1/student-app/question-bank-drafts/summary`

They remove list-row loading and response serialization from mobile badge
views, but the cross-module `student-app-flow` audit still only checks the
older base Student App paths. That leaves a regression gap: a future change
could remove a summary path, drop private ETag/304 headers, or turn a
summary-only response back into a list-shaped response without failing the
Student App flow gate.

## Scope

This slice extends `tools/student-app-flow-audit.mjs` and its tests so the
Student App flow gate covers the three summary fast paths as first-class
mobile contract surfaces.

It does not add runtime endpoints, database schema, shared cache, Redis, model
execution, OCR, RAG, Swarm, worker behavior, or a new performance benchmark.

## Contracts

1. Each summary fast path must remain present in `contracts/openapi/teaching-archive.yaml`.
2. Each summary path file must require both `AgentApiKey` and `PrincipalContextHeader`.
3. Each summary path must keep private conditional cache semantics:
   `If-None-Match`, `304`, `ETag`, `Cache-Control: private, no-cache`, and `Vary`.
4. Each summary-only response schema must expose only `summary` and
   `additionalProperties: false`.
5. Each nested summary object must remain count-only and must not expose list
   fields, row identifiers, student identifiers, worker state, refs, internal
   error fields, model output, OCR/RAG chunks, or Swarm state.

## Acceptance Criteria

- The current Student App flow audit passes with all three summary paths.
- A test fails the audit when `/v1/student-app/question-bank-drafts/summary`
  is removed from the Teaching Archive OpenAPI root.
- A test fails the audit when a summary path loses private conditional cache
  semantics.
- A test fails the audit when a summary-only response schema leaks list-shaped
  `data` fields.
- Structure verification tracks this SDD and the audit/test files.

## Performance Note

This is a quality-gate hardening slice for the existing read-path optimization
work. It preserves the current whole-system performance evidence:
`22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

The practical performance value is preventing regression: Student App home and
badge reads should keep using count-only summary contracts instead of
accidentally falling back to row/card list contracts.

## Rollback

Remove the summary fast-path checks and tests from `student-app-flow-audit`,
remove this SDD from the structure verifier and root trace, and remove the
0367 architecture-board note. The runtime API behavior remains unchanged.
