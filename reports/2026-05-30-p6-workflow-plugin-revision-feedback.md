# P6 Workflow Plugin Revision Feedback Evidence

Date: 2026-05-30

## Slice

- SDD: `docs/sdd/0074-workflow-plugin-revision-feedback.md`
- Boundary: generated workflow/plugin revision feedback after failed sandbox or human revision request.
- Root-requirement link: failed generated workflow/plugin attempts must report errors, feed back into revision, and must not enter the registry until the revised artifact passes sandbox and human review.

## Red

Focused test before implementation:

```text
node --test tools\workflow-plugin-revision-feedback.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\tools\workflow-plugin-revision-feedback.mjs'
fail 1
```

## Green

Focused behavior covered:

- failed sandbox evidence creates `REVISION_REQUIRED`.
- human `REVISION_REQUESTED` approval creates `REVISION_REQUIRED`.
- save-ready sandbox and approval create no revision request.
- rejected human approval creates no revision request.
- sandbox failure takes precedence over human approval feedback.

Current audit output:

```text
npm run audit:workflow-plugin-revision
Workflow Plugin revision feedback: REVISION_REQUIRED
```

Generated current report:

- `reports/workflow-plugin-revision-feedback.current.json`
- `revisionDecision`: `REVISION_REQUIRED`
- `saveBlocked`: `true`
- `sourceKind`: `SANDBOX_FAILURE`

## Full Gates

Commands run after implementation:

```text
npm test
```

Result:

- `npm run verify:structure`: pass.
- Focused revision feedback test: 5 tests, 1 suite, 5 pass, 0 fail.
- Node test runner: 62 tests, 14 suites, 62 pass, 0 fail.
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
- direct-limited connection budget: pass.
- pgbouncer connection budget: pass.

## Cleanup

Cargo target cleanup was run after the final Rust/Cargo gate:

```text
Test-Path -LiteralPath 'services\agent-harness\target'
False
```

## Drift Checks

No baseline runtime dependency was added for model training, OCR, RAG, or model execution.

No SQL table was added for this slice.

No package lockfile, Go module, Cargo manifest, Cargo lockfile, or SQL contract drift is expected:

```text
git diff -- package-lock.json services\identity-access-gateway\go.mod services\identity-access-gateway\go.sum services\teaching-archive-gateway\go.mod services\teaching-archive-gateway\go.sum services\agent-harness\Cargo.toml services\agent-harness\Cargo.lock contracts\sql\teaching-archive.sql contracts\sql\identity-sessions.sql
```

## Size Guard

- `tools/workflow-plugin-revision-feedback.mjs`: 117 lines.
- `tools/verify-structure.mjs`: 415 lines.
- `tools/quality-gate.mjs`: 315 lines.
