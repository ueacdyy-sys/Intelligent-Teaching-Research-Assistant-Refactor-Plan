# P7 AI Worker Job Contract Gate Evidence

Date: 2026-05-30

## Slice

- SDD: `docs/sdd/0075-ai-worker-job-contract-gate.md`
- Boundary: isolated AI worker job/result contracts for RAG retrieval, OCR recognition, and fine-tuning.
- Root-requirement link: public/private knowledge isolation, node-specific access rules, OCR-ready teaching workflows, and private fine-tuning must not pull model dependencies into the baseline runtime.

## Red

Focused test before implementation:

```text
node --test tools\ai-worker-job-audit.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\tools\ai-worker-job-audit.mjs'
fail 1
```

## Green

Focused behavior covered:

- current isolated worker job contracts pass.
- worker jobs cannot become baseline runtime dependencies.
- worker job schema must include `RAG_RETRIEVAL`, `OCR_RECOGNITION`, and `FINE_TUNING`.
- worker results cannot write directly to the main database.
- cloud worker jobs cannot request private knowledge.
- public cloud RAG example must remain present.
- remote-device worker jobs cannot read this machine's local private data.

Current audit output:

```text
npm run audit:ai-worker-job
AI Worker job: READY
```

Generated current report:

- `reports/ai-worker-job.current.json`
- `readiness`: `READY`
- includes `AI worker job contract audit` in `reports/quality-gate.current.json`

## Full Gates

Commands run after implementation:

```text
npm test
```

Result:

- `npm run verify:structure`: pass.
- Node test runner: 69 tests, 15 suites, 69 pass, 0 fail.
- Go tests: pass across conversation, identity, and teaching archive gateways.
- Rust tests: pass for `services/agent-harness`.

```text
npm run quality
```

Result:

- `allPassed`: `true`
- `npm test`: pass.
- `go vet`: pass.
- `cargo test`: pass.
- identity session runtime audit: pass.
- identity access contract audit: pass.
- student app flow audit: pass.
- agent harness flow audit: pass.
- workflow plugin flow audit: pass.
- workflow plugin registry admission: pass.
- workflow plugin revision feedback: pass.
- AI worker job contract audit: pass.
- direct-limited connection budget: pass.
- pgbouncer connection budget: pass.

## Cleanup

Cargo target cleanup was run after the final Rust/Cargo gate:

```text
Test-Path -LiteralPath 'services\agent-harness\target'
False
```

## Drift Checks

No Python package, model package, OCR package, RAG package, training package, or baseline runtime dependency was installed.

No SQL table was added for this slice.

No package lockfile, Go module, Cargo manifest, Cargo lockfile, or SQL contract drift is expected:

```text
git diff -- package-lock.json services\identity-access-gateway\go.mod services\identity-access-gateway\go.sum services\teaching-archive-gateway\go.mod services\teaching-archive-gateway\go.sum services\agent-harness\Cargo.toml services\agent-harness\Cargo.lock contracts\sql\teaching-archive.sql contracts\sql\identity-sessions.sql
```

## Size Guard

- `tools/ai-worker-job-audit.mjs`: 281 lines.
- `tools/verify-structure.mjs`: 419 lines.
- `tools/quality-gate.mjs`: 316 lines.
