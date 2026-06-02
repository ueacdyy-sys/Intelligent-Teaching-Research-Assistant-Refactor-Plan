# SDD 0161: System Scale-Up Identity Write Concurrency Profile

## Problem

P67 proved that the system mixed workload can record and compare Identity
session table persistence, but `mixed5800` still has Identity `revokeCycle` as
the max-P99 bottleneck. The P67 child report shows:

- `sessionDbWriteConcurrencyPerWorker=0`, so the Identity write limiter is
  disabled.
- `revokeCycle` P99 is `2100.79ms`.
- `revokeCycle.revoke` is the slowest step at `995.48ms` P99.

Identity-only runners already support `--session-db-write-concurrency`, and
SDD 0106/0107 already keep the limiter opt-in with telemetry. The system
mixed, sustained, and scale-up orchestrators do not expose or record that
setting, so the full mixed workload cannot prove whether bounded write
concurrency helps, hurts, or only moves queue time.

## Scope

In scope:

- Add a system-level Identity write-concurrency option for benchmark runners
  only.
- Keep the default conservative: `0` means no write limiter.
- Pass the system option to the Identity HTTP child benchmark as
  `--session-db-write-concurrency`.
- Record the selected profile in system mixed, sustained, and scale-up
  `databaseProfile` sections.
- Validate the option as a non-negative integer.

Out of scope:

- Enabling the write limiter by default.
- Changing Identity token, session, or revoke semantics.
- Raising PostgreSQL, PgBouncer, gateway pool, or ingress limits.
- Claiming full-system ultra-concurrency support.

## Contracts

System benchmark runners accept:

```text
--identity-session-db-write-concurrency 0|N
```

The mixed workload runner passes that value to the Identity HTTP child runner
as:

```text
--session-db-write-concurrency 0|N
```

Rollup reports include:

```json
{
  "databaseProfile": {
    "identitySessionDbWriteConcurrency": 0
  }
}
```

## Acceptance Criteria

- System mixed workload tests prove the option is parsed, passed to the
  Identity child runner, and recorded in `databaseProfile`.
- Sustained mixed workload tests prove the option survives sample expansion and
  is recorded in the report profile.
- Scale-up tests prove the option survives step expansion and is recorded in
  the report profile.
- Negative values are rejected.
- Existing secret masking remains intact.
- Focused Node tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.
- Any Docker performance run keeps `--docker-cleanup reset` and records whether
  the setting improves or worsens P67 rather than promoting a new default.

## Rollback

Remove the system-level option and report field. Identity-only benchmarks keep
their existing write concurrency option and default behavior.
