# SDD and TDD Working Rules

## SDD Gate

Every feature starts with a specification in `docs/sdd` before implementation.

Required sections:

- problem statement
- source requirement references
- scope and non-scope
- contracts touched
- acceptance criteria
- rollback plan
- observability and performance evidence

## TDD Gate

Every production behavior needs a failing test first or a contract verifier that fails before implementation.

Required test layers:

- domain/use-case tests without database or HTTP
- adapter tests for HTTP shape and error semantics
- integration tests only when infrastructure is required

## Architecture Rules

- Inner layers cannot import HTTP, PostgreSQL, Redis, or framework packages.
- Use cases define ports; adapters implement them.
- Public contracts live in `contracts`.
- New languages enter only through a bounded module with tests and rollback.
- Empty endpoint benchmarks are reference-only and cannot justify migration.

## Strict Quality Gate

Fast local iteration uses:

```powershell
npm test
```

Before treating a slice as merge-ready, run:

```powershell
npm run quality
```

The strict gate must stay Docker-free by default. It includes structure checks, tool tests, Go tests, Rust tests, Go vet, Go/Rust formatting drift checks through tests/static checks, clean architecture import checks, runtime TODO marker checks, file-size thresholds, Identity contract audits, runtime profile audit, and direct/PgBouncer connection budget gates.

## Done Means

A slice is done only when:

- SDD spec is written and linked to the root requirement.
- Contract is present or intentionally not needed.
- Tests pass.
- Strict quality gate passes before merge-ready status.
- Runtime config is documented.
- Performance target is stated.
- Rollback route is stated.
