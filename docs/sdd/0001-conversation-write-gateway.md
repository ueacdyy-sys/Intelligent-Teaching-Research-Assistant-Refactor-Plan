# SDD 0001: Conversation Write Gateway

## Problem

The legacy research conversation write path is a measured bottleneck. Under 800-way concurrency, complete FastAPI writes reached about 1011 RPS with P95 about 1034ms, while a Go same-table insert probe reached about 5515 RPS with P95 about 186ms.

This slice creates a bounded Go gateway for conversation creation. It is the first hot-path migration candidate, not a full rewrite.

## Scope

In scope:

- Create a research conversation through a contract-first Go HTTP endpoint.
- Validate title and settings at the boundary.
- Generate server-side ID and timestamps.
- Persist through an inward repository port.
- Return stable JSON compatible with the future TypeScript SDK.
- Keep domain/use-case logic independent from HTTP and PostgreSQL.

Out of scope:

- Message creation.
- Multi-model fusion.
- RAG retrieval.
- Direct replacement of all FastAPI research APIs.
- Agent command execution.

## Contract

OpenAPI contract:

`contracts/openapi/conversation-write-gateway.yaml`

Primary endpoint:

`POST /v1/research/conversations`

## Acceptance Criteria

- Empty or whitespace title returns validation failure.
- Valid title is trimmed before persistence.
- IDs are server generated with the `conv_` prefix.
- The use case can be tested without HTTP or PostgreSQL.
- HTTP adapter returns `201` with the response DTO on success.
- HTTP adapter returns `422` with structured error semantics on validation errors.
- PostgreSQL adapter is outer-layer only and hidden behind the repository port.

## Performance Target

Initial target:

- 800 concurrency write path above 2000 RPS.
- P95 below 500ms.
- Failure rate 0 under the chosen connection budget.

## Rollback

Route traffic back to legacy FastAPI `POST /api/v1/research/conversations`.

Future production migration must use one of:

- shadow write with comparison
- double write with legacy source of truth
- feature flag percentage rollout
