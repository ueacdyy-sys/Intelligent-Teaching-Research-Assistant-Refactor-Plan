# SDD 0247 - Research Deep Research Final Answer Review

## Problem

`ResearchAgent.deep_research` can now produce an evidence-grounded reasoning
draft from approved retrieval evidence. That still is not enough for the root
research workflow: a draft can be cited and useful, while still needing human
review for evidence coverage, safety, limitations, private-knowledge handling,
and whether it is suitable for a future final answer.

The risky shortcut is to treat a synthesis draft as a user-facing final answer,
publish it, or write it into a durable answer store without review. This slice
adds a final-answer review gate that records whether the draft may enter a
future finalization runtime or must be revised.

## Scope

Add a review-only final-answer gate for `deep_research`.

This slice:

- accepts only a `research_deep_research_reasoning_synthesis_runtime` output
  whose boundary still requires future final-answer review
- requires a non-student human reviewer with research-write permission or admin
  permission
- records an append-only review through
  `DeepResearchFinalAnswerReviewPort.recordDeepResearchFinalAnswerReview`
- requires citation, source-hash, evidence-coverage, limitation, and safety
  review flags
- returns either `APPROVED_FOR_FINALIZATION` or a revision/rejection decision
- preserves the full evidence chain from retrieval execution and reasoning
  synthesis
- blocks direct final-answer generation, publication, direct database access,
  main database writes, external model calls, local tool mutation, Swarm, remote
  device control, and student archive writes

This is not final-answer generation and not publication. Approval only means a
future finalization runtime may consume the reviewed draft under its own SDD,
quality gate, and rollback evidence.

## Contracts

- Input schema:
  `contracts/agent/deep-research-final-answer-review.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-final-answer-review.output.schema.json`
- Examples:
  `contracts/agent/deep-research-final-answer-review.input.example.json`
  and `contracts/agent/deep-research-final-answer-review.output.example.json`
- Runtime:
  `tools/research-deep-research-final-answer-review-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-final-answer-review-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-final-answer-review-audit.mjs`
- Audit tests:
  `tools/research-deep-research-final-answer-review-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-final-answer-review.jsonl`. The
idempotency key prevents duplicate review records for the same synthesis draft
and review decision.

## Acceptance Criteria

- `node --test tools/research-deep-research-final-answer-review-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-final-answer-review-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-final-answer-review` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchFinalAnswerReview`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research final answer review audit`.
- The architecture board states that `deep_research` has a final-answer review
  gate while finalization, publication, and true multi-model fusion remain
  future approved slices.

## Rollback

Remove the final-answer review schemas, examples, runtime, tests, audit, audit
tests, report, command log output, `package.json` audit script, strict quality
entry, root workflow coverage requirement, structure-verifier entries, and
architecture board text. Keep SDD 0242 through SDD 0246 intact because intent
admission, worker lifecycle, retrieval planning, retrieval execution, and
reasoning synthesis remain valid without final-answer review.
