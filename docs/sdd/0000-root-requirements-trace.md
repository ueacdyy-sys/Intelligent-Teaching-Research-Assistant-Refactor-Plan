# SDD 0000: Root Requirements Trace

## Authoritative Source

The authoritative product source is:

`C:\Users\Administrator\Desktop\智能教研助手\项目根本需求（禁止改动）`

The HTML architecture board is a derived planning artifact, not the source of truth.

## Product Capabilities

| Capability | Requirement Summary | Refactor Boundary |
| --- | --- | --- |
| Teaching mode | Quiz, AI grading, attendance, resources, tutoring, archive materials, student profiles | Teaching subsystem |
| Research mode | Multi-model conversation, node management, bookmarks, knowledge base, training, device collaboration | Research subsystem |
| Student app | Login, AI tutor, student archive, teaching materials, personalized question bank, scan-to-answer | Student subsystem |
| Agent mode | Orchestrating agent, teaching/research sub-agents, external app control, workflow/plugin generation | Agent subsystem + Harness |
| Knowledge isolation | Public/private knowledge bases, different access rights for cloud/local/remote nodes | Data platform + policy |
| Workflow and plugins | AI generates workflow/plugin code, tests it, reports failure, waits for human approval | Workflow engine + Harness |
| Packaging and runtime | Small package, stable desktop operation, efficient concurrency | Rust local runtime + Go hot services |

## Non-Negotiable Invariants

- Private student and private knowledge data must not be sent to a cloud node without policy approval.
- External application control must pass through Agent Harness.
- AI-generated workflows/plugins are draft-only until tests and human approval pass.
- Training/model dependencies are optional worker dependencies, not baseline runtime dependencies.
- New language modules require contracts, tests, performance evidence, and rollback.

## Current Trace Slices

| Slice | Root Capability | Evidence Boundary |
| --- | --- | --- |
| SDD 0315 published search foundation | Student app, teaching materials, student archive | `GET /v1/student-app/archive-items?query=` searches title/tags only inside the Student App visible publication projection. |
| SDD 0316 published detail metadata read | Student app, teaching materials, student archive | `GET /v1/student-app/archive-items/{archiveItemId}` returns only safe metadata for the authenticated student's own published archive item and excludes `contentRef`, publication internals, answers, model output, and worker state. |
| SDD 0317 published content preview precheck | Student app, teaching materials, student archive | Blocks Student App published-material content preview until a safe preview store and renderer exist; consumes 0316 metadata evidence and does not read raw content or expose `contentRef`. |
| SDD 0318 published content preview read foundation | Student app, teaching materials, student archive | Adds `GET /v1/student-app/archive-items/{archiveItemId}/content-preview` over a dedicated safe preview table and Student App publication projection filter; does not expose `contentRef`, raw content, OCR/RAG chunks, answers, model output, or worker/publication internals. |
| SDD 0319 published content preview render envelope | Student app, teaching materials, student archive | Adds `GET /v1/student-app/archive-items/{archiveItemId}/content-preview/rendered` over the 0318 safe preview read foundation; emits `SAFE_TEXT_BLOCKS` only and still excludes raw content, `contentRef`, HTML/Markdown, OCR/RAG chunks, answers, model output, and worker/publication internals. |
| SDD 0320 student app archive item study packet | Student app, teaching materials, student archive | Adds `GET /v1/student-app/archive-items/{archiveItemId}/study-packet` to combine safe published metadata with the 0319 `SAFE_TEXT_BLOCKS` preview; excludes `studentId`, `contentRef`, raw/full content, HTML/Markdown, OCR/RAG chunks, answers, model output, and worker/publication internals. |
| SDD 0321 student app archive item learning actions | Student app, AI tutor, personalized question bank, student archive | Adds `GET /v1/student-app/archive-items/{archiveItemId}/learning-actions` to expose safe action affordances for a READY study packet; actions point only to the existing AI tutor request queue and do not expose prompts, answers, `contentRef`, preview content, OCR/RAG chunks, model output, or worker/publication internals. |
| SDD 0322 student app ai tutor published learning action source | Student app, AI tutor, personalized question bank, teaching materials | Extends `POST /v1/student-app/ai-tutor-requests` with optional `learningActionSource` so material-detail actions must prove the 0321 READY learning-action boundary before queue admission; it still creates only the existing tutor request queue item and does not expose preview content, prompts, OCR/RAG chunks, answers, model output, or worker/publication internals. |
