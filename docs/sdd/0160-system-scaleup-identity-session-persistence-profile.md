# SDD 0160: System Scale-Up Identity Session Persistence Profile

## Problem

P66 mixed workload evidence moved the max P99 back to Identity `revokeCycle`.
The Identity-only benchmark can already profile the session table as `logged`
or `unlogged`, but the system mixed, sustained, and scale-up orchestrators do
not expose that option or record it in their rollup reports.

Without this plumbing, a full mixed workload result cannot clearly answer
whether Identity write latency is limited by the session table persistence
profile, the write path itself, or unrelated queueing.

## Scope

In scope:

- Add a system-level Identity session table persistence option for benchmark
  runners only.
- Keep the default conservative: `logged`.
- Pass the system option to the Identity HTTP child benchmark as
  `--session-db-session-table-persistence`.
- Record the selected profile in system mixed, sustained, and scale-up
  `databaseProfile` sections.
- Validate the option as `logged` or `unlogged`.

Out of scope:

- Changing production defaults.
- Changing Identity session semantics.
- Claiming root SLO promotion or ultra-concurrency support.
- Replacing the remaining write-path optimization work.

## Contracts

System benchmark runners accept:

```text
--identity-session-db-session-table-persistence logged|unlogged
```

The mixed workload runner passes that value to the Identity HTTP child runner
as:

```text
--session-db-session-table-persistence logged|unlogged
```

Rollup reports include:

```json
{
  "databaseProfile": {
    "identitySessionTablePersistence": "logged"
  }
}
```

## Acceptance Criteria

- System mixed workload parse tests accept and normalize the new option.
- System mixed workload command tests prove the Identity child runner receives
  the session persistence option.
- Sustained mixed workload tests prove the option survives sample expansion and
  is recorded in the report profile.
- Scale-up tests prove the option survives step expansion and is recorded in
  the report profile.
- Existing secret masking remains intact.
- Focused Node tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove the system-level option and report field. Identity-only benchmarks keep
their existing session persistence option and default behavior.
