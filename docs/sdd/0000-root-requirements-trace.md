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
