# SDD 0365: Structure Verifier Required File Registry

## Problem

`tools/verify-structure.mjs` had reached the 800-line strict quality limit while still holding both verifier logic and a large core required-file list. Continuing to add SDD/TDD slices in the same file would either break quality gates or encourage unsafe compression of validation logic.

## Scope

This slice extracts the core required-file list into `tools/verify-structure-required-files.mjs` and keeps `tools/verify-structure.mjs` focused on verification logic. A compact static audit hook remains in `tools/verify-structure.mjs` so existing audit scripts that scan the verifier source can still see the required-file evidence while the registry is the maintained data source. It does not change product behavior, runtime endpoints, database schema, performance claims, secrets, or root requirements.

## Contracts

- `tools/verify-structure-required-files.mjs` exports `requiredCoreFiles`.
- `tools/verify-structure.mjs` imports `requiredCoreFiles` and continues to report missing required files through the existing structure gate.
- `tools/verify-structure-required-files.test.mjs` verifies that the extracted registry is unique, uses normalized repository-relative paths, includes this SDD slice, and stays synchronized with the legacy static audit hook.

## Acceptance Criteria

- `npm run verify:structure` passes with the extracted registry.
- `node --test tools/verify-structure-required-files.test.mjs tools/verify-structure-sdd-discovery.test.mjs` passes.
- `tools/verify-structure.mjs` and `tools/verify-structure-required-files.mjs` both remain below the 800-line source quality limit.
- The change is behavior-preserving for the structure gate and legacy audit scanners: it moves required-file data without weakening SDD discovery, required file checks, quality script checks, server configuration checks, or existing audits that expect required-file names in the verifier source.

## Rollback

Restore the previous inline required-file array in `tools/verify-structure.mjs`, remove `tools/verify-structure-required-files.mjs`, remove `tools/verify-structure-required-files.test.mjs`, and delete this SDD if the registry split causes import or packaging issues.
