# Refactor Backlog

This backlog is for the whole system refactor. The project is rebuilt module by module, but the product boundary remains the root requirements file.

## P0a: Freeze and Observe

- Export current OpenAPI.
- Record current database schema.
- Record PostgreSQL settings in every performance report.
- Keep legacy project runnable.

## P0b: Connection and Write Path

- Audit async/sync database engine multiplication.
- Add a global connection budget.
- Set PostgreSQL/PgBouncer strategy.
- Add an executable PgBouncer performance profile.
- Reduce write-path DTO/ORM/cache overhead.

## P1: Contract First

- Define OpenAPI for hot migrated endpoints.
- Generate TypeScript SDK after contracts stabilize.
- Remove scattered frontend backend URLs.
- Define shared principal context before moving teaching, research, student, and Agent Harness routes.

## P2: Go Hot Slice

- Implement Conversation Write Gateway.
- Implement Quiz Submit API or Job API next.
- Add shadow/double-write verification.

## P2b: Identity And Access

- Contract teacher password and WeChat login.
- Contract student app login and own-archive access.
- Contract remote social command grants.
- Project a shared Principal Context into every module.
- Gate access matrix changes with contract tests.
- Implement the first Go Identity Access Gateway slice.

## P3: Rust Harness

- Implement permission manifest schema.
- Implement dry-run process/file adapters.
- Require audit evidence and rollback plan.

## P4: Python AI Workers

- Isolate RAG/OCR/training.
- Keep model dependencies out of baseline runtime.

## P5: Whole Product Modules

- Identity and access for teacher, student, and remote command entry.
- Teaching mode archive material, quiz, tutoring, grading, and UI slices.
- Research mode APIs and UI slices.
- Student app APIs and mobile-first flows.
- Agent Harness permission, evidence, and rollback model.
- AI-generated workflow/plugin sandbox and approval model.
- Knowledge/data policy and retrieval performance.
