# SDD 0071: Structure Verifier SDD Discovery

## Problem

The strict quality gate now enforces an 800-line source limit, and
`tools/verify-structure.mjs` has reached 799 lines after SDD 0070. Continuing the
whole-system refactor by manually appending every new SDD to the verifier will
repeatedly collide with the same quality limit.

The verifier should stay strict, but its SDD checks need to become data-driven:
discover SDD files from `docs/sdd`, require contiguous numeric IDs, and validate
the required SDD headings without adding new code lines for every future slice.

## Source Requirement References

- Root requirement: new language modules and generated capabilities require
  contracts, tests, performance evidence, and rollback.
- Development rule: every feature starts with SDD, then failing tests or
  executable gates.
- SDD 0014: strict quality gate rejects oversized files and structure drift.
- Whole-system module map: the project is rebuilt module by module under the
  immutable root requirements.

## Scope

In scope:

- Replace hardcoded per-SDD heading checks with SDD directory discovery.
- Require SDD numeric IDs to start at `0000` and remain contiguous.
- Keep the special trace-document headings for SDD 0000.
- Accept either `## Contract` or `## Contracts` for implementation SDDs.
- Export pure verifier functions so the discovery logic can be unit tested.
- Keep `npm run verify:structure` behavior unchanged for callers.
- Restore structure-verifier headroom below the strict 800-line quality limit.

Out of scope:

- Changing any SDD content.
- Relaxing required headings.
- Relaxing source file size limits.
- Moving the whole required file list to a separate manifest.
- Changing product runtime behavior.

## Contracts

Updated tooling:

- `tools/verify-structure.mjs`
- `tools/verify-structure-sdd-discovery.test.mjs`

The public tool contract remains:

- `npm run verify:structure` exits nonzero when required refactor structure is
  missing or malformed.

## Acceptance Criteria

- `node --test tools/verify-structure-sdd-discovery.test.mjs` passes.
- Unit tests prove SDD discovery detects numeric gaps.
- Unit tests prove SDD 0000 uses trace headings.
- Unit tests prove implementation SDDs require problem, scope, contract(s),
  acceptance criteria, and rollback headings.
- `npm run verify:structure` passes on the current repository.
- `tools/verify-structure.mjs` remains below 800 lines.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, SQL table, OCR/RAG/model, or training dependency is
  added.

## Rollback

Restore the explicit SDD file list and per-SDD heading checks in
`tools/verify-structure.mjs`, remove the SDD discovery tests, and remove this
SDD. Product contracts and runtime behavior remain unchanged.

## Observability And Performance Evidence

Record:

- failing unit-test evidence before implementation.
- targeted SDD discovery test result after implementation.
- `npm run verify:structure` result.
- full `npm test` result.
- strict `npm run quality` result.
- final `tools/verify-structure.mjs` line count.
