# Quality Evidence: Structure Verifier SDD Discovery

## Scope

SDD 0071 replaces hardcoded SDD heading checks in
`tools/verify-structure.mjs` with discovery-based validation over `docs/sdd`.
The gate remains strict: SDD IDs must start at `0000`, remain contiguous, and
include the required trace or implementation headings.

No package dependency, SQL table, model dependency, OCR/RAG dependency, or
training dependency was added.

## Red Evidence

Before implementation, the focused SDD discovery test could not import the new
API:

```text
SyntaxError: The requested module './verify-structure.mjs' does not provide an export named 'discoverSddDocuments'
```

After the first mechanical rewrite, importing the verifier still executed the
CLI side effects and the repository structure check found historical SDD debt:

```text
SDD 0003 missing heading: ## Rollback
```

## Green Evidence

Focused SDD discovery tests:

```powershell
node --test tools\verify-structure-sdd-discovery.test.mjs
```

Result:

```text
tests 4
pass 4
fail 0
```

Structure gate:

```powershell
npm run verify:structure
```

Result:

```text
Refactor structure verified.
```

Strict gates:

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

Structure verifier size:

```text
tools/verify-structure.mjs: 402 lines
```

Dependency and schema drift check:

```powershell
git diff -- package.json package-lock.json services\identity-access-gateway\go.mod services\identity-access-gateway\go.sum services\teaching-archive-gateway\go.mod services\teaching-archive-gateway\go.sum services\agent-harness\Cargo.toml services\agent-harness\Cargo.lock contracts\sql\teaching-archive.sql contracts\sql\identity-sessions.sql
```

Result: no diff.

## Review Notes

- `discoverSddDocuments` is pure enough for unit tests and does not execute the
  CLI gate on import.
- `verifySddDocuments` preserves the SDD 0000 trace-document exception and
  requires implementation SDDs to carry problem, scope, contract(s), acceptance,
  and rollback headings.
- SDD 0003 and SDD 0004 were strengthened with missing rollback/contracts
  sections instead of weakening the new verifier.
