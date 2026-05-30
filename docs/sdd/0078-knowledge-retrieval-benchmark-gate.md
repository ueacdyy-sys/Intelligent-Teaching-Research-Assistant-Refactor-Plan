# SDD 0078: Knowledge Retrieval Benchmark Gate

## Problem

SDD 0076 locks the knowledge access policy and requires hybrid retrieval, but it
does not yet prove that retrieval planning is measurable. The root requirement
explicitly asks to improve knowledge base retrieval efficiency while retaining
old chunking and adding an intent-and-directory retrieval route.

Without an executable benchmark gate, later work could report empty endpoint
latency, skip private/student/remote-owned coverage, or regress to chunk-only
planning while still claiming P7 retrieval performance evidence.

## Source Requirement References

- Root requirement: public and private knowledge bases are physically isolated.
- Root requirement: cloud nodes may access only public knowledge.
- Root requirement: local nodes may access public and private knowledge.
- Root requirement: remote-device nodes cannot access this machine's knowledge
  base, but may use their own device knowledge.
- Root requirement: old text chunking is retained while adding or mixing a newer
  intent-and-directory RAG retrieval strategy.
- SDD/TDD working rule: empty endpoint benchmarks are reference-only and cannot
  justify migration.
- SDD 0076: retrieval policy requires `HYBRID`, chunking retained, directory
  intent indexing enabled, and a query-plan performance budget.

## Scope

In scope:

- Add a knowledge retrieval benchmark profile contract.
- Add a current deterministic benchmark profile with non-empty corpus and
  workloads.
- Cover public, private, student archive, and remote-owned knowledge partitions.
- Exercise cloud, local, and remote-device node policies.
- Require hybrid planning to examine both directory-intent and chunk candidates.
- Enforce the current query-plan candidate and P95 budgets.
- Add a Docker-free executable benchmark audit and include it in strict quality.

Out of scope:

- Installing embedding, vector database, OCR, model, RAG, or training packages.
- Calling an external model.
- Building the final retrieval engine or persistent index.
- Adding PostgreSQL tables or vector indexes.
- Benchmarking network, database, or UI rendering latency.
- Changing existing teaching, identity, student, workflow, or worker runtime
  behavior.

## Contracts

Schema:

- `contracts/knowledge/knowledge-retrieval-benchmark.schema.json`

Current profile:

- `contracts/knowledge/knowledge-retrieval-benchmark.current.json`

Tooling:

- `tools/knowledge-retrieval-benchmark-audit.mjs`
- `tools/knowledge-retrieval-benchmark-audit.test.mjs`
- `reports/knowledge-retrieval-benchmark.current.json`

## Acceptance Criteria

- `node --test tools/knowledge-retrieval-benchmark-audit.test.mjs` fails before
  the benchmark audit tool exists.
- Current benchmark profile has a non-empty corpus and non-empty workload set.
- Workloads cover `CLOUD`, `LOCAL`, and `REMOTE_DEVICE` nodes.
- Workloads cover `PUBLIC`, `PRIVATE`, `STUDENT_ARCHIVE`, and
  `REMOTE_DEVICE_OWNED` knowledge.
- Every current workload uses `HYBRID` planning with directory-intent and chunk
  candidates.
- Benchmark planning stays within the policy `maxDirectoryCandidates` and
  `maxChunkCandidates` budgets.
- Benchmark P95 query-plan time is at or below the policy `targetP95Ms`.
- Returned candidates never cross the workload's allowed classifications.
- `npm run audit:knowledge-retrieval-benchmark` passes and writes
  `reports/knowledge-retrieval-benchmark.current.json`.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, embedding, vector database, or
  training dependency is added.

## Rollback

Remove the retrieval benchmark profile contract, current profile, audit tool,
focused tests, current report, package audit script, quality-gate entry,
structure verifier entries, and this SDD. Earlier P7 policy, worker contract,
and worker admission gates remain unchanged.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused retrieval benchmark audit test result after implementation.
- `npm run audit:knowledge-retrieval-benchmark` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
- confirmation that no AI retrieval dependency was installed.
