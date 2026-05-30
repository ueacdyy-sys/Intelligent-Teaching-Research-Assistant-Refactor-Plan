# P6 Evidence: Workflow Plugin Registry Admission

## Scope

SDD 0073 adds the first save-boundary implementation for P6 Workflow And
Plugins. It admits a generated workflow/plugin artifact into a registry entry
only after matching draft, sandbox, and approval records prove sandbox success,
human performance/effect review, and explicit registry-save approval.

No package dependency, SQL table, model dependency, OCR/RAG dependency, or
training dependency was added.

## Red Evidence

Focused test before implementation:

```powershell
node --test tools\workflow-plugin-registry-admission.test.mjs
```

Result:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\tools\workflow-plugin-registry-admission.mjs'
fail 1
```

The failure proved there was no registry admission/store boundary after SDD
0072's contract gate.

## Green Evidence

Focused test:

```powershell
node --test tools\workflow-plugin-registry-admission.test.mjs
```

Result:

```text
tests 5
pass 5
fail 0
```

Registry admission audit:

```powershell
npm run audit:workflow-plugin-registry
```

Result:

```text
Workflow Plugin registry admission: ALLOW_SAVE
```

Structure gate:

```powershell
npm run verify:structure
```

Result:

```text
Refactor structure verified.
```

Full gates:

```powershell
npm test
npm run quality
```

Result:

```text
npm test: PASS
npm run quality: PASS
```

Rust build output cleanup:

```powershell
Test-Path .\services\agent-harness\target
```

Result:

```text
False
```

Tool line counts:

```text
tools/workflow-plugin-registry-admission.mjs: 160 lines
tools/verify-structure.mjs: 413 lines
tools/quality-gate.mjs: 314 lines
```

## Review Notes

- Admission blocks failed sandbox runs, approval records that do not allow save,
  and mismatched draft/sandbox/approval IDs.
- Allowed registry entries remain `DRY_RUN_ONLY` with
  `localExecutionEnabled=false`.
- The JSONL registry store is append-only and covered by focused readback tests.
- The quality gate now runs `workflow plugin registry admission` after the P6
  contract-flow audit.
