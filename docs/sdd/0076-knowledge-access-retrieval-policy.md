# SDD 0076: Knowledge Access And Retrieval Policy

## Problem

P7 needs the knowledge/data policy before any real RAG implementation. The root
requirements are explicit: public and private knowledge bases must be physically
isolated, cloud nodes can access only public knowledge, local nodes can access
public and private knowledge, and remote-device nodes cannot access this
machine's knowledge base. The same requirement also says the old text chunking
approach should remain, but retrieval must add a newer intent-and-directory
index strategy, or a hybrid of both.

Without an executable knowledge policy gate, later RAG or worker work could
accidentally merge public/private stores, let remote devices read local
knowledge, or regress to chunk-only retrieval without the directory-intent path.

## Source Requirement References

- Root requirement: cloud nodes may access only public knowledge.
- Root requirement: local nodes may access public and private knowledge.
- Root requirement: remote-device nodes must not access this machine's
  knowledge base, but may use their own device knowledge.
- Root requirement: public and private knowledge bases must be physically
  isolated.
- Root requirement: old text chunking is retained, while newer RAG retrieval
  based on intent recognition and document directory structure is added or
  mixed with chunking.
- Whole-system module map: P7 Knowledge And Data requires a knowledge access
  policy contract and retrieval benchmarks later.

## Scope

In scope:

- Add a knowledge access and retrieval policy contract.
- Add a current policy example for public, private, student-archive, and
  remote-owned knowledge boundaries.
- Require physical isolation for local public/private/student stores.
- Require cloud-node policy to allow public local knowledge only.
- Require local-node policy to allow local public, private, and student archive
  knowledge.
- Require remote-device policy to forbid this machine's local knowledge stores
  while allowing remote-owned knowledge.
- Require retrieval strategy support for `CHUNK_VECTOR`,
  `INTENT_DIRECTORY_INDEX`, and `HYBRID`.
- Require current retrieval defaults to use `HYBRID` with directory intent
  enabled and chunking retained.
- Add an executable audit and include it in the strict quality gate.

Out of scope:

- Building vector indexes or embedding stores.
- Installing RAG, OCR, model, or training dependencies.
- Running retrieval benchmarks.
- Creating PostgreSQL tables.
- Implementing worker execution, query routing, or UI.
- Changing existing identity, teaching, workflow, or harness runtime behavior.

## Contracts

Schema:

- `contracts/knowledge/knowledge-access-policy.schema.json`

Current policy:

- `contracts/knowledge/knowledge-access-policy.current.json`

Tooling:

- `tools/knowledge-access-policy-audit.mjs`
- `tools/knowledge-access-policy-audit.test.mjs`
- `reports/knowledge-access-policy.current.json`

## Acceptance Criteria

- `node --test tools/knowledge-access-policy-audit.test.mjs` fails before the
  audit tool exists.
- The policy declares physically isolated `PUBLIC`, `PRIVATE`, and
  `STUDENT_ARCHIVE` local partitions.
- Cloud nodes may access only local public knowledge.
- Local nodes may access local public, private, and student archive knowledge.
- Remote-device nodes cannot access this machine's local public, private, or
  student archive knowledge.
- Remote-device nodes may access only `REMOTE_DEVICE_OWNED` knowledge.
- Retrieval strategy vocabulary includes `CHUNK_VECTOR`,
  `INTENT_DIRECTORY_INDEX`, and `HYBRID`.
- The current retrieval default is `HYBRID`.
- The current retrieval profile has `chunkingRetained=true` and
  `directoryIntentIndexEnabled=true`.
- `npm run audit:knowledge-policy` passes and writes
  `reports/knowledge-access-policy.current.json`.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Remove the knowledge policy contract, current policy, audit tool, focused tests,
current report, package audit script, quality-gate entry, structure verifier
entries, and this SDD. Earlier P7 AI worker job contracts remain unchanged.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused knowledge policy audit test result after implementation.
- `npm run audit:knowledge-policy` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
- note that retrieval benchmarks remain a later P7 slice.
