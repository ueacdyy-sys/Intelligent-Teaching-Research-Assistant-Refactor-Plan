# SDD 0242 - Research Deep Research Intent Runtime

## Problem

The root Research workflow now has a low-latency read-only retrieval path
(`ResearchAgent.search_knowledge`). That path is intentionally small and stays
within the 50ms budget.

The remaining research gap is the deeper async path. The product needs a way
to admit a `deep_research` request as a reviewable, evidence-backed intent
without pretending that full RAG synthesis, model reasoning, or a final answer
already happened.

## Scope

Add `tools/research-deep-research-intent-runtime.mjs` as an admission-only
runtime for `ResearchAgent.deep_research`.

This runtime:

- accepts a `RESEARCH` task with `requiresHumanApproval = true`
- enforces `SINGLE_WORKER` routing for `ResearchAgent.deep_research`
- validates principal, shared context, guardrail, route decision, source policy,
  async policy, budget, and evidence refs
- submits a reviewable intent through an injected `DeepResearchIntentPort`
- returns a queued or pending-review job record with evidence and SLO metadata

This slice does not implement full Agent Loop, Swarm, synchronous RAG
synthesis, final answer generation, direct database access, external model
calls now, local tool mutation, direct publication, or broad production10k
retesting. Put plainly: it does not implement full RAG synthesis and does not produce a final answer.

## Contracts

- Runtime API: `tools/research-deep-research-intent-runtime.mjs`
- Runtime tests: `tools/research-deep-research-intent-runtime.test.mjs`
- Runtime audit: `tools/research-deep-research-intent-audit.mjs`
- Runtime audit tests: `tools/research-deep-research-intent-audit.test.mjs`
- Root workflow coverage: `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate: `tools/quality-gate.mjs`

The runtime is an admission boundary. It may queue or review a deep research
intent, but it must not produce the final answer, execute full RAG synthesis,
or bypass human review.

## Acceptance Criteria

- `node --test tools/research-deep-research-intent-runtime.test.mjs` passes.
- `node --test tools/research-deep-research-intent-audit.test.mjs` passes.
- `npm run audit:research-deep-research-intent-runtime` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchIntent`.
- `npm run verify:structure` requires this SDD, runtime, runtime test, audit,
  and audit test.
- Strict quality includes `Research deep_research intent runtime audit`.
- The architecture board states that `deep_research` is an async admission
  slice, not a synchronous RAG or final-answer path.

## Rollback

Remove `tools/research-deep-research-intent-runtime.mjs`, its tests and audit
files, remove `audit:research-deep-research-intent-runtime` from
`package.json` and strict quality, remove `researchDeepResearchIntent` from
root workflow coverage, remove this SDD from structure verification, delete
`reports/research-deep-research-intent.current.json`, and revert the
architecture board text to the previous research-only evidence state.
