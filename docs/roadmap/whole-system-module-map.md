# Whole System Module Map

## Root Requirements Are The Product Boundary

The refactor target is the whole Intelligent Teaching Research Assistant system, not a single service experiment.

Authoritative product source:

`C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`

The HTML architecture board, SDD files, reports, and tools are derived execution artifacts. They must serve the root requirements and must not redefine the product scope.

## Execution Rule

## One Module At A Time

Each module moves through the same path:

1. Read the root requirement and current implementation.
2. Write or update SDD.
3. Define contracts before implementation.
4. Write tests or executable gates before production behavior.
5. Implement a narrow vertical slice.
6. Verify behavior, performance, rollback, and observability.
7. Route traffic gradually or keep the legacy path active.

## Module Boundaries

| Module | Root Capability | Refactor Owner Language | First Evidence Slice | Done Evidence |
| --- | --- | --- | --- | --- |
| Runtime Foundation | Small package, stable desktop runtime, efficient concurrency | Rust + Go | PgBouncer profile, connection budget, Tauri/Harness shell | install size, startup time, health checks, rollback |
| Identity And Access | Teacher login, student login, remote/social command identity | Go + TypeScript | Auth contract and Go identity gateway | login tests, permission tests, token rotation |
| Teaching Mode | Quiz, AI grading, attendance, resources, tutoring, whiteboard, archives | Go + TypeScript + Python workers | Quiz Submit API or archive material API | API contract, UI flow, load evidence |
| Research Mode | Multi-model conversation, nodes, bookmarks, knowledge base, training, device collaboration | Go + TypeScript + Python workers | Conversation Write Gateway | shadow writes, read/write load, contract SDK |
| Student App | Student login, AI tutor, archive, teaching materials, question bank, scan answer | TypeScript + Go + Python OCR | Student profile read model and tutor job API | mobile flow test, privacy policy test |
| Agent Harness | Orchestrating agent, teaching/research subagents, external app control | Rust + Go | Permission manifest and dry-run file/process adapters | audit evidence, approval flow, rollback |
| Workflow And Plugins | AI-generated workflow/plugin code, tests, human approval | Go + Rust + TypeScript | Workflow draft/test/save contract | sandbox tests, approval tests, registry tests |
| Knowledge And Data | Public/private KB isolation, vector retrieval, archives, analytics | Go + Python workers + PostgreSQL | Knowledge access policy contract | isolation tests, retrieval benchmarks |
| AI Workers | RAG, OCR, model calls, training, speech/multimodal | Python behind Job API | Worker Job API and result DTO | no direct main DB writes, worker dependency isolation |
| Observability And Operations | Performance reports, no mock monitoring, stable release | Go + TypeScript | performance profile gates | reports, dashboards, alert thresholds |

## Non-Negotiable Invariants

- The root requirements file is read-only.
- Training/model dependencies are optional worker dependencies, not baseline runtime dependencies.
- All local performance secrets use `ueacd`.
- Python workers do not become the platform bus.
- Go services must own a real contract or hot path, not act as empty proxies.
- Rust owns local trust boundaries and must not become ordinary CRUD.
- TypeScript consumes generated contracts instead of scattered fetch calls.
- Every migrated module keeps a rollback route until the new path is proven with current evidence.

## Current Execution Order

1. P0 Runtime Foundation: connection budget, PgBouncer profile, legacy pool remediation.
2. P1 Research Write Path: Conversation Write Gateway, event contract, shadow/double-write verification.
3. P2 Identity And Access: teacher/student/remote command identity contracts.
4. P3 Teaching Mode: quiz submit, archive material, tutoring job APIs.
5. P4 Student App: student profile, teaching materials, AI tutor, scan answer.
6. P5 Agent Harness: permission manifest, evidence store, file/process/browser adapters.
7. P6 Workflow And Plugins: AI-generated draft, sandbox test, human approval, registry.
8. P7 Knowledge And AI Workers: retrieval policy, RAG/OCR/training worker isolation.
