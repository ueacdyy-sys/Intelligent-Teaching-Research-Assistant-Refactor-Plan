# SDD 0246 - Research Deep Research Reasoning Synthesis

## Problem

`ResearchAgent.deep_research` can now record an approved retrieval execution
with cited source chunks. The remaining gap before a reviewable research answer
is a controlled reasoning step: the system must prove that synthesis only uses
retrieved evidence, preserves citation/source-hash lineage, and stops before
final publication.

The risky shortcut is turning retrieved chunks into an uncited answer, allowing
direct model/network calls from the runtime, or publishing a final answer without
human review. This slice inserts an auditable draft boundary between retrieval
evidence and any future final answer.

## Scope

Add an approved reasoning/synthesis draft boundary for `deep_research`.

This slice:

- accepts only a `research_deep_research_retrieval_execution_runtime` output
  with recorded retrieval execution
- requires an internal service/admin principal with research read scope and
  private-knowledge read scope when private chunks are present
- invokes reasoning only through the injected
  `DeepResearchReasoningPort.composeEvidenceGroundedDraft`
- requires every draft claim to cite existing retrieved citations and
  source hashes
- records a draft through
  `DeepResearchReasoningSynthesisPort.recordDeepResearchReasoningSynthesis`
- enforces claim, citation, source-hash, and token-budget limits
- blocks direct database access, writes, student archive data, remote-device
  sources, direct external network/model calls from this runtime, Swarm, local
  tool mutation, final answer generation, and publication

This is a draft-only synthesis boundary. It may produce a reviewable,
evidence-grounded draft, but it does not publish a final answer and does not
claim user-facing completion. Final answer review/publication remains a future approved slice.

## Contracts

- Input schema:
  `contracts/agent/deep-research-reasoning-synthesis.input.schema.json`
- Output schema:
  `contracts/agent/deep-research-reasoning-synthesis.output.schema.json`
- Examples:
  `contracts/agent/deep-research-reasoning-synthesis.input.example.json`
  and `contracts/agent/deep-research-reasoning-synthesis.output.example.json`
- Runtime:
  `tools/research-deep-research-reasoning-synthesis-runtime.mjs`
- Runtime tests:
  `tools/research-deep-research-reasoning-synthesis-runtime.test.mjs`
- Audit:
  `tools/research-deep-research-reasoning-synthesis-audit.mjs`
- Audit tests:
  `tools/research-deep-research-reasoning-synthesis-audit.test.mjs`
- Root workflow coverage:
  `tools/root-workflow-coverage-audit.mjs`
- Strict quality gate:
  `tools/quality-gate.mjs`

The append-only command log defaults to
`reports/research-command-log/deep-research-reasoning-synthesis.jsonl`. The
idempotency key prevents duplicate synthesis records for the same retrieval
execution and draft policy.

## Acceptance Criteria

- `node --test tools/research-deep-research-reasoning-synthesis-runtime.test.mjs`
  passes.
- `node --test tools/research-deep-research-reasoning-synthesis-audit.test.mjs`
  passes.
- `npm run audit:research-deep-research-reasoning-synthesis` reports `READY`.
- `npm run audit:root-workflow-coverage` reports `READY` and requires
  `researchDeepResearchReasoningSynthesis`.
- `npm run verify:structure` requires this SDD, both schemas, both examples,
  runtime, runtime test, audit, and audit test.
- Strict quality includes `Research deep_research reasoning synthesis audit`.
- The architecture board states that `deep_research` has approved
  reasoning/synthesis draft evidence while final answer generation and
  publication remain future slices.

## Rollback

Remove the reasoning/synthesis schemas, examples, runtime, tests, audit, audit
tests, report, command log output, `package.json` audit script, strict quality
entry, root workflow coverage requirement, structure-verifier entries, and
architecture board text. Keep SDD 0242 through SDD 0245 intact because intent
admission, worker lifecycle, retrieval planning, and retrieval execution remain
valid without synthesis.
