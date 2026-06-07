# SDD 0239 - StudentTutorAgent Read-Only Runtime Adapter

## Problem

The root student workflow requires a real, privacy-scoped path for personalized practice recommendations. Before this slice, `StudentTutorAgent.recommend_practice` had contract and small SLO evidence, but the shared read-only dispatcher could not invoke a real adapter. That left the student app personalized learning workflow weaker than the TeachingAgent path and made the architecture board over-reliant on contract-level evidence.

## Scope

Add a real read-only runtime adapter for `StudentTutorAgent.recommend_practice` and wire it into the shared Agent read-only runtime dispatcher.

The adapter only calls an injected `StudentLearningReadPort.recommendPracticeContext`. It must validate `PrincipalContext`, `SharedContext`, `GuardrailResult`, `RouteDecision`, skill input, and read-port rows before returning recommendations.

This slice does not implement a full AI Tutor conversation loop, final scoring, assignment creation, model reasoning, cross-student analysis, direct database access, or broad production10k retesting.

## Contracts

- Skill input: `contracts/agent/skills/recommend-practice.input.schema.json`
- Skill output: `contracts/agent/skills/recommend-practice.output.schema.json`
- Adapter contract: `contracts/agent/student-tutor-agent-readonly-adapter.schema.json`
- Runtime adapter: `tools/student-tutor-agent-readonly-runtime-adapter.mjs`
- Runtime audit: `tools/student-tutor-agent-readonly-runtime-adapter-audit.mjs`
- Dispatcher: `tools/agent-readonly-runtime-dispatcher.mjs`
- Root workflow coverage: `tools/root-workflow-coverage-audit.mjs`

The adapter accepts only `OWN` student scope for a student principal or `ASSIGNED` scope for teacher/admin principals. It rejects write intent, external model access, final evaluation, cross-student comparison, remote principals, unsafe SharedContext scopes, denied guardrails, wrong route decisions, missing read ports, raw archive rows, cross-student rows, local tool mutation, and out-of-scope student ids.

## Acceptance Criteria

- `node --test tools/student-tutor-agent-readonly-runtime-adapter.test.mjs` passes.
- `node --test tools/student-tutor-agent-readonly-runtime-adapter-audit.test.mjs` passes.
- `node --test tools/agent-readonly-runtime-dispatcher.test.mjs tools/agent-readonly-runtime-dispatcher-audit.test.mjs` passes with both TeachingAgent and StudentTutorAgent real dispatch probes.
- `npm run audit:student-tutor-agent-readonly-runtime-adapter` reports `READY`.
- `npm run audit:agent-readonly-runtime-dispatcher` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires `studentTutorAgentReadonlyRuntimeAdapter`.
- `npm run verify:structure` requires this SDD, runtime adapter, tests, audit, and audit tests.
- Strict quality must include `StudentTutorAgent read-only runtime adapter audit`.

## Rollback

Remove `tools/student-tutor-agent-readonly-runtime-adapter.mjs`, its tests and audit files, remove `audit:student-tutor-agent-readonly-runtime-adapter` from `package.json` and strict quality, remove the StudentTutor real adapter requirement from root workflow coverage, revert dispatcher wiring for `StudentTutorAgent.recommend_practice` back to contract-only, remove this SDD from `tools/verify-structure.mjs`, and delete `reports/student-tutor-agent-readonly-runtime-adapter.current.json`.
