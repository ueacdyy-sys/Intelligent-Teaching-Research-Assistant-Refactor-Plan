# ADR 0001: Polyglot Boundaries

## Status

Accepted.

## Context

The legacy system is a large Python/FastAPI, React/Electron project. Performance testing showed read paths are acceptable, but write-heavy paths suffer from application hot-path overhead and database connection multiplication.

The refactor goal is a small install package, complete functionality, efficient runtime, stable operation, and broader vibecoding engineering experience without turning the system into an uncontrolled multi-language rewrite.

## Decision

Use four primary languages only:

- TypeScript for UI and generated SDKs.
- Go for hot API paths, job APIs, command routing, and event workers.
- Rust for local runtime, Agent Harness, permissions, file/process/CLI adapters, and small desktop packaging.
- Python for AI workers, RAG, OCR, model calls, and training.

No other primary language is admitted unless a future ADR proves a bounded, tested, rollback-safe reason.

## Consequences

- Go must not be a dumb FastAPI proxy.
- Rust must not rewrite ordinary CRUD.
- Python stops being the platform bus and becomes AI worker infrastructure.
- TypeScript clients consume contracts, not scattered fetch calls.
