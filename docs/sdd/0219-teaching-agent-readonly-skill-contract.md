# SDD 0219: TeachingAgent Read-Only Skill Contract

## Problem

SDD 0218 made AgentTask, SkillManifest, SharedContext, RouteDecision, and
GuardrailResult machine-checkable. The next whole-system slice must stop there
from becoming a presentation-only control plane. Root requirements keep
Teaching Mode as a core product surface: teaching materials, archive resources,
quizzes, AI grading, tutoring, and student-side learning all need a safe path
for an Agent to read teaching material evidence before drafting or explaining
anything.

The existing `search_teaching_material` Skill manifest named that path, but the
referenced input and output schemas did not exist yet. Without those concrete
schemas, future TeachingAgent runtime code could silently expand a read-only
fast path into student archive access, external model calls, or direct database
writes.

## Scope

In scope:

- Add concrete input and output schemas for `search_teaching_material`.
- Add examples for a TeachingAgent read-only material lookup.
- Extend the Agent Skill contract audit so the new schemas are required.
- Keep the path bound to SharedContext, evidence refs, principal context, and
  the current 50ms interactive budget.
- Keep student archive access, private knowledge leakage, external model use,
  and direct database writes disabled on this fast path.

Out of scope:

- Implementing the runtime Agent loop.
- Adding a vector store, RAG engine, OCR, model training, Milvus, Mem0, vLLM,
  or other heavy AI dependencies to the baseline.
- Creating quiz drafts, saving generated content, or writing workflow/plugin
  artifacts.
- Re-running broad performance matrices.

## Contracts

- `contracts/agent/skills/search-teaching-material.input.schema.json`
  defines the read-only Skill input.
- `contracts/agent/skills/search-teaching-material.output.schema.json`
  defines the cited read-only Skill output.
- SDD 0220 adds the runtime adapter contract that must sit between
  TeachingAgent and the Teaching Archive read port before Agent runtime code can
  be promoted.
- The input contract requires `contextRef`, `principalContextRef`,
  `evidenceRefs`, `latencyBudgetMs`, `writeIntent=false`,
  `studentDataAccess=NONE`, `externalModelAllowed=false`,
  `ownerType=TEACHING`, and `includeStudentArchive=false`.
- The output contract requires teaching-only result items, cited source
  evidence, safety fields, `directDatabaseWriteAllowed=false`,
  `studentDataReturned=false`, `externalModelUsed=false`, and runtime evidence
  before promotion.
- `npm run audit:agent-skill-contracts` is the executable gate for this slice.

## Acceptance Criteria

- Focused tests pass for the current TeachingAgent read-only Skill contract.
- The audit fails if `search_teaching_material` stops pointing at the concrete
  input/output schemas.
- The audit fails if the input schema can request writes, student archives, or
  external model calls.
- The audit fails if the output schema can return student data or skip runtime
  evidence before promotion.
- The audit fails if examples exceed the 50ms interactive budget.
- `npm run verify:structure` requires the new Skill schema and example files.
- Runtime adapter boundaries are handled by SDD 0220 and remain contract-only
  until live SLO evidence exists.

## Rollback

Remove the four `contracts/agent/skills/search-teaching-material.*.json` files,
remove the TeachingAgent read-only checks from
`tools/agent-skill-contract-audit.mjs`, remove the focused tests, remove the
files from `tools/verify-structure.mjs`, regenerate
`reports/agent-skill-contracts.current.json`, and delete this SDD. The broader
Agent control-plane contract from SDD 0218 remains intact, but
`search_teaching_material` must then be treated as a manifest-only placeholder.

## Observability And Performance Evidence

This is contract evidence, not new throughput evidence. It does not change the
current production10k claim. Before TeachingAgent read-only runtime can be
promoted beyond contract-only status, it still needs live runtime evidence
showing the Skill adapter respects the 50ms budget under the same root workflow
coverage discipline.
