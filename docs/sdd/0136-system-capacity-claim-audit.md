# SDD 0136: System Capacity Claim Audit

## Problem

The refactor now has strong module-level performance evidence, especially for
Research conversation writes. That evidence is useful, but it is not the same as
proof that the whole Intelligent Teaching Research Assistant supports
ultra-high concurrency under real root workflows.

Current evidence is intentionally split:

- Identity and access has Docker-backed HTTP benchmarks at 4400 concurrency, but
  its slowest phases still have multi-second tail latency.
- Research conversation write has much stronger low-tail and WSL burst evidence,
  but the 30000-concurrency result is a short-burst functional profile, not a
  sustained full-system SLO.
- Teaching Archive and quiz workflows need their own read/write evidence
  because they cover student archives, teaching materials, quiz submissions,
  and AI grading request preparation.
- Knowledge retrieval has policy and query-planning smoke evidence, not a
  production-corpus throughput benchmark.
- AI worker runtime evidence proves forbidden model/OCR/RAG/vector/training
  packages are absent from the baseline, not worker throughput.
- The strict quality gate is green, but quality health does not replace mixed
  workload capacity evidence.

The system needs a machine-readable guard that says exactly what can be claimed
from current evidence and what still requires a mixed workload benchmark.

## Source Requirement References

- Root requirement: refactor the whole system around the immutable product
  requirements, module by module only as delivery order.
- Root requirement: performance claims must support teaching and research
  workflows, not isolated benchmark vanity numbers.
- Root requirement: baseline runtime and package size must remain small; no
  model, OCR, RAG, vector, embedding, training, or external load-test dependency
  may be added for this audit.
- SDD 0135: Local Go is the current low-tail load generator, WSL Go is the
  high-concurrency edge and burst load generator, Docker Go is smoke evidence.

## Scope

In scope:

- Add a Docker-free Node audit over the current performance evidence registry.
- Require current evidence for identity, conversation, Teaching Archive,
  knowledge retrieval, AI-worker runtime dependencies, and the strict quality
  gate.
- Produce an explicit whole-system capacity claim status.
- Block full-system ultra-concurrency promotion when no mixed workload evidence
  exists.
- Register the audit as performance evidence and include it in the strict
  quality gate.

Out of scope:

- Running a new live mixed workload benchmark.
- Changing service contracts, schemas, worker fanout, PgBouncer, PostgreSQL, or
  OS networking settings.
- Promoting any conversation-only short-burst profile as full-system capacity.
- Adding training, OCR, RAG, vector, embedding, model, or external benchmark
  dependencies.

## Contracts

- `npm run audit:system-capacity-claim` writes
  `reports/system-capacity-claim.current.json`.
- The audit returns `READY` when it can safely evaluate the current evidence and
  the current evidence does not overclaim.
- The audit must return `NOT_SUPPORTED_BY_CURRENT_EVIDENCE` for full-system
  ultra-concurrency when mixed workload evidence is absent.
- Sustained mixed workload smoke evidence changes the next required evidence
  from first sustained profile to sustained scale-up; it still must not promote
  a full-system capacity claim by itself.
- The audit must fail readiness if any required source evidence is unregistered,
  unreadable, unparsable, or if the strict quality gate fails.
- The audit must fail readiness if forbidden AI/model/OCR/RAG/vector/training
  packages appear in the baseline runtime dependency profile.

## Acceptance Criteria

- Focused tests prove current module evidence passes the audit while blocking
  full-system ultra-concurrency promotion.
- Focused tests prove missing registered evidence fails readiness.
- Focused tests prove missing source reports fail readiness.
- Focused tests prove a failing quality gate fails readiness.
- Focused tests prove forbidden baseline AI dependencies fail readiness.
- Focused tests prove every root module must have an explicit module-limit or
  evidence-gap classification.
- `npm run audit:system-capacity-claim` passes.
- `npm run test:tools`, `npm run audit:performance-evidence`, and
  `npm run quality` pass.

## Rollback

Remove the system capacity claim audit script, tests, report, quality-gate
command, and performance-evidence registry entry. Existing module-level
benchmark reports remain available for manual review.

## Observability And Performance Evidence

The audit report records:

- required evidence registration and source report parseability;
- identity concurrency, slowest P95/P99 phase, runtime, and session table
  persistence profile;
- conversation low-tail, high-concurrency edge, and functional burst profiles;
- Teaching Archive archive-create, quiz-submission, and archive-list smoke
  limits;
- knowledge retrieval query-plan P95 and workload coverage count;
- AI worker baseline dependency scan and forbidden dependency status;
- strict quality command count and static finding count;
- mixed workload evidence count;
- explicit full-system claim status and required next evidence.
