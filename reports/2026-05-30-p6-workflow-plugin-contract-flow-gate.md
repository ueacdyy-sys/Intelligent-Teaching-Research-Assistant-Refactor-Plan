# P6 Evidence: Workflow Plugin Contract Flow Gate

## Scope

SDD 0072 starts P6 Workflow And Plugins with contract-first gates for generated
workflow/plugin artifacts. The slice locks the draft to sandbox to human review
to registry-save path without executing generated code.

No package dependency, SQL table, model dependency, OCR/RAG dependency, or
training dependency was added.

## Red Evidence

Focused test before implementation:

```powershell
node --test tools\workflow-plugin-flow-audit.test.mjs
```

Result:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\tools\workflow-plugin-flow-audit.mjs'
fail 1
```

The failure proved P6 had no executable workflow/plugin contract-flow gate.

## Green Evidence

Focused test:

```powershell
node --test tools\workflow-plugin-flow-audit.test.mjs
```

Result:

```text
tests 5
pass 5
fail 0
```

Workflow/plugin audit:

```powershell
npm run audit:workflow-plugin-flow
```

Result:

```text
Workflow Plugin flow: READY
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
tools/workflow-plugin-flow-audit.mjs: 299 lines
tools/verify-structure.mjs: 411 lines
tools/quality-gate.mjs: 313 lines
```

## Review Notes

- Draft contracts require generated files, dry-run execution, sandbox testing,
  human approval, and no immediate registry save.
- Plugin drafts explicitly support `TASK_FAILURE_LEARNING`, which preserves the
  root requirement that plugins are self-evolution components, not editor
  extensions.
- Sandbox contracts require sandbox execution, no host writes, and default-deny
  network policy.
- Approval contracts require both performance and effect review before save.
- Registry entries stay dry-run and local-execution-disabled in this slice.
