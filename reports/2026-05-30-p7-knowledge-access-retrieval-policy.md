# P7 Knowledge Access And Retrieval Policy Evidence

Date: 2026-05-30

## Slice

- SDD: `docs/sdd/0076-knowledge-access-retrieval-policy.md`
- Boundary: knowledge access policy and retrieval strategy contract.
- Root-requirement link: cloud/local/remote node access rules, public/private physical isolation, and hybrid RAG retrieval that keeps chunking while adding intent plus directory indexing.

## Red

Focused test before implementation:

```text
node --test tools\knowledge-access-policy-audit.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\tools\knowledge-access-policy-audit.mjs'
fail 1
```

## Green

Focused behavior covered:

- current knowledge access and retrieval policy passes.
- private knowledge must be physically isolated.
- cloud nodes cannot access private knowledge.
- remote-device nodes cannot access this machine's local knowledge.
- retrieval strategy vocabulary must include directory intent indexing.
- current retrieval cannot regress to chunk-only mode.

Current audit output:

```text
npm run audit:knowledge-policy
Knowledge access policy: READY
```

Generated current report:

- `reports/knowledge-access-policy.current.json`
- `readiness`: `READY`
- includes `knowledge access policy audit` in `reports/quality-gate.current.json`

## Full Gates

Commands run after implementation:

```text
npm test
```

Result:

- `npm run verify:structure`: pass.
- Node test runner: 75 tests, 16 suites, 75 pass, 0 fail.
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
- knowledge access policy audit: pass.
- direct-limited connection budget: pass.
- pgbouncer connection budget: pass.

## Cleanup

Cargo target cleanup was run after the final Rust/Cargo gate:

```text
Test-Path -LiteralPath 'services\agent-harness\target'
False
```

## Drift Checks

No package dependency, model package, OCR package, RAG package, training package, or baseline runtime dependency was installed.

No SQL table was added for this slice.

No package lockfile, Go module, Cargo manifest, Cargo lockfile, or SQL contract drift is expected:

```text
git diff -- package-lock.json services\identity-access-gateway\go.mod services\identity-access-gateway\go.sum services\teaching-archive-gateway\go.mod services\teaching-archive-gateway\go.sum services\agent-harness\Cargo.toml services\agent-harness\Cargo.lock contracts\sql\teaching-archive.sql contracts\sql\identity-sessions.sql
```

## Size Guard

- `tools/knowledge-access-policy-audit.mjs`: 230 lines.
- `tools/verify-structure.mjs`: 421 lines.
- `tools/quality-gate.mjs`: 317 lines.

## Remaining P7 Evidence

Retrieval benchmarks, worker admission, and actual RAG/OCR/training execution remain later slices. This slice only locks the policy boundary.
