# P7 Knowledge Retrieval Benchmark Gate Evidence

## Scope

- SDD: `docs/sdd/0078-knowledge-retrieval-benchmark-gate.md`
- Boundary: deterministic, Docker-free hybrid retrieval planning benchmark.
- Root-requirement link: retain chunking, add intent-and-directory retrieval,
  preserve public/private/student/remote-owned knowledge isolation, and avoid
  empty endpoint performance claims.

## Red Test

Command:

```powershell
node --test tools\knowledge-retrieval-benchmark-audit.test.mjs
```

Expected failure before implementation:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\tools\knowledge-retrieval-benchmark-audit.mjs'
tests 1
fail 1
```

This proved there was no executable retrieval benchmark gate after SDD 0076.

## Focused Test

Command:

```powershell
node --test tools\knowledge-retrieval-benchmark-audit.test.mjs
```

Result:

- 6 tests passed.
- Current hybrid retrieval benchmark passes.
- Every workload uses non-empty directory-intent and chunk candidates.
- Chunk-only policy regression fails.
- Empty corpus fails.
- Cross-classification workload leakage fails.
- P95 budget regression fails.

## Audit

Command:

```powershell
npm run audit:knowledge-retrieval-benchmark
```

Result:

- `Knowledge retrieval benchmark: READY`
- P95 query plan: `2.55ms`
- Max candidates: `directory=1`, `chunk=2`
- Current report: `reports/knowledge-retrieval-benchmark.current.json`
- Corpus: 4 documents, 8 chunks, 4 workloads.
- Workloads cover `CLOUD`, `LOCAL`, `REMOTE_DEVICE`, `PUBLIC`, `PRIVATE`,
  `STUDENT_ARCHIVE`, and `REMOTE_DEVICE_OWNED`.

## Full Gates

Command:

```powershell
npm test
```

Result:

- structure verified.
- Node tool tests: 89 passed across 18 suites.
- Go tests passed for conversation, identity, and teaching archive gateways.
- Rust Agent Harness tests passed.

Command:

```powershell
npm run quality
```

Result:

- `reports/quality-gate.current.json` has `allPassed=true`.
- `knowledge retrieval benchmark audit`: pass.
- direct-limited connection budget: pass.
- PgBouncer connection budget: pass.

## Drift Checks

- `services/agent-harness/target` cleanup result: `False`.
- New benchmark gate is Docker-free and uses only Node built-ins.
- No Python, model, OCR, RAG, embedding, vector database, or training dependency
  was added.
- No package lock, Go module, Cargo, or SQL contract change belongs to this
  slice.

## Review Notes

- Clean Architecture score: 9/10. The benchmark remains a policy-side planning
  gate and does not pull retrieval engine details into application runtime. The
  remaining point belongs to a later persistent index slice.
- API/interface score: 9/10. The benchmark profile is explicit and additive.
  Future real retrieval engines can add metrics without changing existing
  profile fields.
- Performance evidence score: 8/10. This is stronger than an empty endpoint
  benchmark because it uses non-empty corpus/workloads and exercises hybrid
  planning, but it is still a planning benchmark rather than database/vector
  index latency. Later P7 work should add persistent-index and worker-runtime
  benchmarks.
