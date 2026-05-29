# P3 Teaching Archive Principal Authorization

## Slice

SDD 0031 adds principal authorization to Teaching Archive metadata creation and query endpoints.

The service still keeps `X-Agent-Api-Key` as the local service boundary, and now also requires `X-Principal-Context` as a base64url JSON principal context. Teaching Archive consumes the shared principal semantics locally and does not import Identity service internals.

## Red Evidence

Before implementation, the SDD 0031 tests failed at compile time:

```text
go test ./services/teaching-archive-gateway/...
FAIL ita-refactor/services/teaching-archive-gateway/internal/domain [build failed]
FAIL ita-refactor/services/teaching-archive-gateway/internal/usecase [build failed]
undefined: domain.AuthorizeCreateArchiveItem
undefined: domain.AuthorizeListArchiveItems
undefined: domain.PrincipalContext
unknown field Principal in struct literal of type domain.CreateArchiveItemInput
unknown field Principal in struct literal of type domain.ListArchiveItemsInput
```

## Implementation Evidence

- Added local Teaching Archive principal contract and authorization rules in `services/teaching-archive-gateway/internal/domain/principal.go`.
- Added `Principal` to create and list input DTOs while keeping repository queries principal-free.
- Added use-case authorization before persistence or reads.
- Added HTTP `X-Principal-Context` parsing with `401` for missing/invalid principal context and `403` for insufficient scope/access.
- Updated `contracts/openapi/teaching-archive.yaml` to require both `AgentApiKey` and `PrincipalContextHeader`.
- Updated `tools/verify-structure.mjs` so SDD 0031 and its authorization files are mandatory.

## Test Evidence

Targeted Teaching Archive test:

```text
go test ./services/teaching-archive-gateway/...
PASS
```

Project test gate:

```text
npm test
PASS
```

Strict quality gate:

```text
npm run quality
[PASS] npm test (70855ms)
[PASS] go vet (72821ms)
[PASS] cargo test (2495ms)
[PASS] identity session runtime audit (755ms)
[PASS] identity access contract audit (648ms)
[PASS] direct-limited connection budget (696ms)
[PASS] pgbouncer connection budget (657ms)
[summary] reports/quality-gate.current.json
```

Latest quality summary:

```json
{
  "allPassed": true,
  "elapsedMs": 149632,
  "staticChecks": {
    "passed": true,
    "findings": []
  }
}
```

## Boundary Confirmation

Search evidence:

```text
rg "identity-access-gateway/internal|services/identity-access-gateway" services/teaching-archive-gateway -n
no matches
```

Teaching Archive remains a separate Go gateway with Clean Architecture layering:

- domain owns principal semantics and authorization rules.
- usecase orchestrates validation, authorization, persistence, and query.
- HTTP adapter parses headers and maps errors.
- PostgreSQL adapter receives only archive item/query data, never principal context.

## Cleanup

`services/agent-harness/target` was removed after the quality run.
