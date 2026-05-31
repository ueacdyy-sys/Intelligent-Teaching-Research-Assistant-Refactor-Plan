# P31 Conversation Write Runner Evidence

## Scope

This slice turns the SDD 0113 Research conversation write benchmark from a
manual multi-process procedure into a reproducible runner command. The runner
starts local Go gateway processes, routes them through the Docker PgBouncer
profile, runs the Go HTTP benchmark, enriches the JSON report with runtime
profile metadata, and stops the gateway processes afterwards.

## Red To Green Evidence

The focused runner test failed before implementation because the runner did not
exist:

```text
ENOENT: no such file or directory, open ... tools/run-conversation-write-benchmark.mjs
ERR_MODULE_NOT_FOUND
```

Green focused test after implementation:

```text
node --test tools/run-conversation-write-benchmark.test.mjs
pass 2
fail 0
```

The test covers:

- argument parsing
- generated gateway base URLs
- benchmark command construction
- local `ueacd` secret validation
- failure report masking
- runtime profile enrichment

## Runtime Profile

- Runner: `npm run bench:conversation-write:pgbouncer`
- PostgreSQL container: `ita-identity-session-postgres`
- PgBouncer container: `ita-identity-session-pgbouncer`
- Gateway count: 6
- Gateway DB pool: `DB_MAX_CONNS=8`
- Total gateway DB pool budget: 48
- Local secrets: `ueacd`

## Runner Scale Curve

Passed:

- 1800 concurrency / 3600 operations: 5438.42 RPS, P95 389.54ms, 0 errors.
- 1900 concurrency / 3800 operations: 5548.08 RPS, P95 362.48ms, 0 errors.
- 1950 concurrency / 3900 operations: 5372.33 RPS, P95 381.25ms, 0 errors.
- 2000 concurrency / 4000 operations: 5813.16 RPS, P95 354.01ms, 0 errors.
- 2100 concurrency / 4200 operations: 5351.62 RPS, P95 404.20ms, 0 errors.

Failed:

- 2200 concurrency / 4400 operations: 127 errors.
- First error: `connectex: No connection could be made because the target machine actively refused it`.
- Gateway exit codes: `[null, null, null, null, null, null]`.

## Current Assessment

The reproducible runner-managed pass point is 2100 concurrency with zero errors,
above 5000 RPS, and P95 below 500ms. This still exceeds the SDD 0001 target by a
large margin, but it is a more conservative and better operational claim than
the earlier hand-started 2200 pass.

The 2200 failure shows all gateway processes remained alive, so the failure is
not a captured gateway crash. The next performance slice should focus on
ingress fan-out, a real reverse-proxy profile, or Windows socket/listener
diagnostics before increasing PostgreSQL or PgBouncer pool sizes.

## Evidence Files

- `tools/run-conversation-write-benchmark.mjs`
- `tools/run-conversation-write-benchmark.test.mjs`
- `reports/conversation-write-http-benchmark.current.json`
- `reports/conversation-write-http-benchmark.runner-concurrency1800-multi6.json`
- `reports/conversation-write-http-benchmark.runner-concurrency1900-multi6.json`
- `reports/conversation-write-http-benchmark.runner-concurrency1950-multi6.json`
- `reports/conversation-write-http-benchmark.runner-concurrency2000-multi6.json`
- `reports/conversation-write-http-benchmark.runner-concurrency2100-multi6.json`
- `reports/conversation-write-http-benchmark.runner-concurrency2200-multi6.json`

## Final Gates

- `node --test tools/run-conversation-write-benchmark.test.mjs`: PASS, 3 tests.
- `go test ./services/conversation-write-gateway/... -count=1`: PASS.
- `npm run audit:performance-evidence`: PASS, 40 evidence entries.
- `npm run quality`: PASS, strict pre-merge gate.
