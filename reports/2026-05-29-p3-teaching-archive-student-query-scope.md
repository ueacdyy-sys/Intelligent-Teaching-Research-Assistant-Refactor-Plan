# P3 Teaching Archive Student Query Scope

## Slice

SDD 0032 tightens Teaching Archive read behavior so principal authorization becomes an actual repository query constraint before archive data is read.

This supports the root requirement that the student app can access the student's own archive and teaching materials without accidentally receiving another student's archive metadata.

## Red Evidence

Before implementation, the new tests failed as expected:

```text
go test ./services/teaching-archive-gateway/...
FAIL ita-refactor/services/teaching-archive-gateway/internal/domain [build failed]
FAIL ita-refactor/services/teaching-archive-gateway/internal/usecase [build failed]
undefined: domain.ScopeListArchiveItems
reader.query.StudentIDs undefined
TestListArchiveItemsScopesStudentPrincipalToOwnArchive: status = 403
```

## Implementation Evidence

- Added `domain.ScopeListArchiveItems` to convert principal student access into an archive query.
- Added `ArchiveItemQuery.StudentIDs` for principal-scoped assigned-roster reads.
- Updated `ListArchiveItems` use case to call the scoping helper before repository access.
- Updated PostgreSQL list query to apply `student_id = ANY($n)` when scoped student IDs are present.
- Added HTTP coverage proving a student principal can omit `studentId` while still receiving only their own student archive rows.
- Updated structure verification to require SDD 0032.

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
[PASS] npm test (70494ms)
[PASS] go vet (65335ms)
[PASS] cargo test (837ms)
[PASS] identity session runtime audit (707ms)
[PASS] identity access contract audit (647ms)
[PASS] direct-limited connection budget (649ms)
[PASS] pgbouncer connection budget (649ms)
[summary] reports/quality-gate.current.json
```

Latest quality summary:

```json
{
  "allPassed": true,
  "elapsedMs": 139728,
  "staticChecks": {
    "passed": true,
    "findings": []
  }
}
```

## Boundary Confirmation

Scoping happens in the inner domain/use-case layers before the storage adapter:

```text
services/teaching-archive-gateway/internal/usecase/list_archive_items.go:29:
scopedQuery, err := domain.ScopeListArchiveItems(input.Principal, query)
```

The PostgreSQL adapter receives only the already-scoped query:

```text
services/teaching-archive-gateway/internal/adapter/postgres/repository.go:
student_id = ANY($n)
```

## Cleanup

`services/agent-harness/target` was removed after the quality run.
