# SDD 0148: Identity PgBouncer Headroom Runtime Application

## Problem

Cross-module diagnostics show the current hot-path database pool total at 89
against PgBouncer `max_db_connections=90`. That leaves only one server
connection of headroom while the reviewed production headroom profile already
requires `maxDbConnections=120`, `defaultPoolSize=100`, and
`reservePoolSize=20`.

Keeping the live performance runtime at 90 makes later Identity and mixed
workload tests measure an artificial configuration ceiling instead of the
current system design ceiling.

## Source Requirement References

- Immutable root requirement: identity, teaching, research, and student flows
  must work as one whole-system assistant.
- SDD 0143: cross-module DB and queue diagnostics must keep shared database
  budgets explicit.
- SDD 0145: PgBouncer production headroom profile approved the 120-connection
  candidate inside the PostgreSQL safe budget.
- SDD 0147: Identity tail latency needs better evidence before claiming
  full-system ultra-concurrency support.

## Scope

In scope:

- Apply the reviewed PgBouncer 120-connection headroom profile to the
  refactor-owned identity performance runtime.
- Update the identity runtime audit so strict quality catches drift back to the
  old 90-connection cap.
- Preserve all local secrets as `ueacd`.

Out of scope:

- Changing session security semantics.
- Changing OpenAPI contracts.
- Raising PostgreSQL `max_connections` beyond the existing 300 safe profile.
- Adding training, OCR, RAG, vector, embedding, or model-heavy dependencies.
- Promoting a full-system ultra-concurrency claim without fresh runtime
  evidence.

## Contracts

- `infra/perf/identity-session-pgbouncer.ini` uses transaction pooling with:
  - `max_client_conn = 10000`;
  - `default_pool_size = 100`;
  - `reserve_pool_size = 20`;
  - `max_db_connections = 120`;
  - `max_user_connections = 10000`.
- `tools/identity-session-runtime-profile-audit.mjs` requires
  `max_db_connections=120`.
- The PostgreSQL runtime remains `max_connections=300` and `shared_buffers=1GB`.

## Acceptance Criteria

- Identity runtime profile audit reports `READY`.
- Strict quality remains passable.
- Docker performance runtime can start with the updated PgBouncer profile.
- Any future concurrency claim must use fresh benchmark evidence generated after
  this runtime change.

## Observability And Performance Evidence

This slice removes a known configuration headroom bottleneck. It is not by
itself a performance win until a new benchmark report shows lower error rate,
higher sustained step depth, or better Identity P99 under the same workload.

## Rollback

Restore the previous PgBouncer runtime values:

- `max_client_conn = 2000`;
- `default_pool_size = 48`;
- `reserve_pool_size = 16`;
- `max_db_connections = 90`;
- `max_user_connections = 2000`.

Then restore the identity runtime audit expectation to 90 and rerun strict
quality.
