# P7 AI Worker Runtime Dependency Profile Evidence

## Scope

- SDD: `docs/sdd/0079-ai-worker-runtime-dependency-profile.md`
- Boundary: baseline runtime dependency audit for optional AI worker packages.
- Root-requirement link: RAG, OCR, model calls, and fine-tuning stay behind
  Python worker boundaries and do not enter the normal desktop/runtime package.

## Red Test

Command:

```powershell
node --test tools\ai-worker-runtime-dependency-profile-audit.test.mjs
```

Expected failure before implementation:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\tools\ai-worker-runtime-dependency-profile-audit.mjs'
tests 1
fail 1
```

This proved there was no executable audit for baseline AI dependency drift.

## Focused Test

Command:

```powershell
node --test tools\ai-worker-runtime-dependency-profile-audit.test.mjs
```

Result:

- 5 tests passed.
- Current baseline dependency profile passes.
- Injecting `sentence-transformers` into `package.json` fails.
- Missing optional `FINE_TUNING` bundle fails.
- Non-`PYTHON_WORKER` bundle ownership fails.
- `baselineRuntimeDependencyAllowed=true` fails.

## Audit

Command:

```powershell
npm run audit:ai-worker-runtime-dependencies
```

Result:

- `AI Worker runtime dependencies: READY`
- Baseline dependencies scanned: `23`
- Baseline manifests present:
  `package.json`, three Go `go.mod` files, and
  `services/agent-harness/Cargo.toml`
- Forbidden AI package hits: `none`
- Optional bundles cover `RAG_RETRIEVAL`, `OCR_RECOGNITION`, and `FINE_TUNING`
- Optional bundles remain `PYTHON_WORKER`, `OPTIONAL_WORKER_ENV`, and
  `baseline=false`

## Full Gates

Command:

```powershell
npm test
```

Result:

- structure verified.
- Node tool tests: 94 passed across 19 suites.
- Go tests passed for conversation, identity, and teaching archive gateways.
- Rust Agent Harness tests passed.

Command:

```powershell
npm run quality
```

Result:

- `reports/quality-gate.current.json` has `allPassed=true`.
- `AI worker runtime dependency audit`: pass.
- direct-limited connection budget: pass.
- PgBouncer connection budget: pass.

## Drift Checks

- `services/agent-harness/target` cleanup result: `False`.
- No package lock, Go module, Cargo, or SQL contract change belongs to this
  slice.
- Optional AI worker packages were declared only as profile metadata. Nothing
  was installed.
- Existing unrelated working-tree deletion remains outside this slice:
  `architecture-board-preview.png`.

## Review Notes

- Clean Architecture score: 9/10. The dependency profile keeps worker details
  outside runtime code and treats Python AI packages as external optional
  adapters. The remaining point belongs to a later isolated worker environment
  implementation.
- API/interface score: 9/10. The profile is additive and stable; future worker
  lockfiles can be attached without changing current baseline fields.
- Performance/package score: 9/10. This gate prevents heavy AI dependency drift
  into the desktop/runtime baseline, directly supporting small install and
  stable startup goals.
