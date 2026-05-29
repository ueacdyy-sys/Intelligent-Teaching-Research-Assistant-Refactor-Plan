# P2 Identity And Access Contract Report

## Scope

Started the whole-system Identity And Access refactor slice.

This slice does not rewrite legacy auth yet. It defines the target identity boundary that teaching, research, student app, remote command entry, and Agent Harness must consume.

Files added:

- `docs/sdd/0006-identity-access-boundary.md`
- `contracts/openapi/identity-access.yaml`
- `contracts/auth/principal-context.schema.json`
- `contracts/auth/access-matrix.json`
- `tools/identity-access-contract-audit.mjs`
- `tools/identity-access-contract-audit.test.mjs`

Files generated:

- `reports/identity-access-contract.current.json`

Files updated:

- `package.json`
- `tools/verify-structure.mjs`
- `docs/roadmap/refactor-backlog.md`
- `README.md`

## Root Requirement Trace

The contract covers:

- teacher password login
- teacher/admin WeChat login start and callback
- student app session creation
- session refresh and revoke
- current principal lookup
- remote mobile/social command grant creation
- shared principal context for permissions and data access

## Current Legacy Evidence

Observed legacy implementation has:

- password, WeChat, refresh, logout, and `auth/me` endpoints
- teacher, student, and admin roles
- mobile/channel auth and command parsing modules
- UI teacher and student login pages

The refactor contract makes these surfaces converge on one `PrincipalContext`.

## Contract Gate

Command:

```powershell
npm run audit:identity-access
```

Result:

```text
Identity access contract: READY
```

The gate verifies:

- required OpenAPI paths exist
- session responses include `PrincipalContext`
- remote command grants include `PrincipalContext`
- bearer and channel signature security schemes exist
- roles include teacher, student, admin, remote operator, and service
- scopes include teaching, research, student archive, knowledge, command, Harness, and admin permissions
- student app has no global private knowledge scope
- remote social command entry cannot directly control local devices
- remote social command entry requires Harness approval

## TDD Evidence

Command:

```powershell
npm run test:tools
```

Result:

```text
tests 19
pass 19
```

## Next Implementation Slice

Implement a small Go Identity service or BFF slice that:

1. validates the new contract shape
2. adapts the legacy auth path behind an interface
3. returns `PrincipalContext` for password login and `/principal`
4. keeps legacy auth as rollback while clients migrate to generated SDKs
