# P68 System Identity Write Concurrency Profile

## Summary

P68 added system-level plumbing for the Identity session DB write concurrency
profile. The setting is benchmark-only and remains opt-in: the default is still
`0`, which keeps the Identity write limiter disabled.

The smoke run proved that the option is parsed by the system scale-up runner,
expanded through sustained and mixed workload samples, passed to the Identity
HTTP child benchmark as `--session-db-write-concurrency`, and recorded in
rollup `databaseProfile` fields.

Result: `identitySessionDbWriteConcurrency=10` is not a usable full mixed
optimization on this Windows/Docker profile. The smoke passed, but the
`mixed5800` and `mixed4400` full mixed shapes both failed. Keep the default at
`0` and do not promote this setting as a capacity improvement.

## SDD

- `docs/sdd/0161-system-scaleup-identity-write-concurrency-profile.md`

## Focused Tests

```powershell
node --test tools\run-system-mixed-workload-benchmark.test.mjs tools\run-system-sustained-mixed-workload.test.mjs tools\run-system-sustained-mixed-workload-scaleup.test.mjs
```

Result: 27 passed, 0 failed.

## Implementation

System benchmark runners now accept:

```text
--identity-session-db-write-concurrency 0|N
```

The mixed workload runner passes the value to the Identity child benchmark as:

```text
--session-db-write-concurrency 0|N
```

Rollup reports include:

```json
{
  "databaseProfile": {
    "identitySessionDbWriteConcurrency": 10
  }
}
```

Negative values are rejected with:

```text
identity-session-db-write-concurrency must be a non-negative integer
```

## Smoke Evidence

P68 smoke command shape:

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p68-write-concurrency-smoke.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p68-write-concurrency-smoke --profile SUSTAINED_SCALEUP_P68_WRITE_CONCURRENCY_SMOKE --manage-docker true --docker-cleanup reset --stop-on-failure true --steps smoke:2:4:4:8:2:4 --samples 1 --sample-interval-ms 0 --identity-gateway-count 2 --conversation-gateway-count 1 --identity-session-db-max-conns 4 --identity-session-db-session-table-persistence unlogged --identity-session-db-write-concurrency 10 --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 8 --max-conns-per-host 8 --warm-connections-per-host 2 --identity-max-conns-per-host 8 --identity-warm-connections-per-host 2 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 2 --identity-ingress-max-conns-per-host 4 --identity-ingress-warm-connections-per-host 2 --timeout 180s --startup-timeout-ms 120000 --max-p99-ms 3000 --max-p99-drift-ms 500
```

Smoke result:

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| smoke | PASSED/PASSED | 2 | 4 | 2 | 28ms | 0 |

Four-layer recording was verified:

| Layer | Field | Value |
| --- | --- | ---: |
| Scale-up rollup | `databaseProfile.identitySessionDbWriteConcurrency` | 10 |
| Sustained step | `databaseProfile.identitySessionDbWriteConcurrency` | 10 |
| Mixed sample | `databaseProfile.identitySessionDbWriteConcurrency` | 10 |
| Identity child | `gatewayDatabaseProfile.sessionDbWriteConcurrencyPerWorker` | 10 |

The Identity child reported `sessionDbWriteConcurrencyTotal=20`, matching two
workers at concurrency 10 each.

## Mixed5800 Evidence

P68 `mixed5800` used the P67 `mixed5800` shape plus
`--identity-session-db-write-concurrency 10`.

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| mixed5800 | FAILED/BLOCKED | 5800 | 5800 | 290 | 1540ms | 7 |

Workload status:

| Workload | Status | Errors | P99 |
| --- | --- | ---: | ---: |
| Identity HTTP | FAILED | 0 recorded in rollup child | n/a |
| Conversation write | FAILED | 7 | 856.79ms |
| Teaching archive | PASSED | 0 | 1540ms |
| Knowledge retrieval | READY | 0 | n/a |
| AI worker admission | READY | 0 | n/a |

Identity failed in `passwordLogin` before phase metrics were produced. The first
error was a Windows socket/buffer pressure failure:

```text
dial tcp 127.0.0.1:19085: bind: An operation on a socket could not be performed because the system lacked sufficient buffer space or because a queue was full.
```

The Identity child profile was:

| Field | Value |
| --- | ---: |
| workerCount | 12 |
| sessionDbMaxConnsPerWorker | 10 |
| sessionDbMaxConnsTotal | 120 |
| sessionDbWriteConcurrencyPerWorker | 10 |
| sessionDbWriteConcurrencyTotal | 120 |
| sessionTablePersistence | unlogged |

Conversation write also failed, with the first error showing the local
conversation target refusing connections while the mixed run was under load.
Its server-side timing stayed much lower than client-observed latency:

| Metric | Value |
| --- | ---: |
| Conversation P99 | 856.79ms |
| Server timing P99 | 78.8ms |
| Client/server gap P99 | 813.55ms |
| `db.acquire` P99 | 0ms |
| `db.batch_wait` P99 | 44.49ms |
| `db.insert` P99 | 45.81ms |

## Mixed4400 Evidence

P68 `mixed4400` used the same write concurrency profile at a lower mixed step.

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| mixed4400 | FAILED/BLOCKED | 4400 | 4400 | 220 | 1716.63ms | 53 |

Workload status:

| Workload | Status | Errors | P99 |
| --- | --- | ---: | ---: |
| Identity HTTP | PASSED | 0 | 1716.63ms |
| Conversation write | FAILED | 53 | 727.25ms |
| Teaching archive | PASSED | 0 | 1252ms |
| Knowledge retrieval | READY | 0 | n/a |
| AI worker admission | READY | 0 | n/a |

Identity passed but remained the system max-P99 owner. `revokeCycle` was still
the slowest Identity phase:

| Identity phase | P99 | Errors |
| --- | ---: | ---: |
| passwordLogin | 1107.63ms | 0 |
| principalLookup | 1431.35ms | 0 |
| refreshRotation | 1214.42ms | 0 |
| revokeCycle | 1716.63ms | 0 |

`revokeCycle` attribution:

| Step | P99 |
| --- | ---: |
| login | 724.73ms |
| revoke | 833.39ms |
| revokedPrincipalLookup | 346.87ms |

Conversation write failed with 53 connection-refused errors. As in `mixed5800`,
the server-side timing was much lower than the client-observed latency:

| Metric | Value |
| --- | ---: |
| Conversation P99 | 727.25ms |
| Server timing P99 | 83.74ms |
| Client/server gap P99 | 717.51ms |
| `db.acquire` P99 | 0ms |
| `db.batch_wait` P99 | 49.18ms |
| `db.insert` P99 | 42.67ms |

## Comparison

| Evidence | Status | Write concurrency | Session table | Max P99 | Identity P99 | Conversation P99 | Teaching P99 | Errors |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| P67 mixed5800 | PASSED | 0 | unlogged | 2100.79ms | 2100.79ms | 731.78ms | 1637ms | 0 |
| P68 mixed5800 | FAILED | 10 | unlogged | 1540ms | n/a | 856.79ms | 1540ms | 7 |
| P68 mixed4400 | FAILED | 10 | unlogged | 1716.63ms | 1716.63ms | 727.25ms | 1252ms | 53 |

## Interpretation

The P68 plumbing is correct, but the candidate setting is not a full-system
optimization. It changes pressure distribution and can make the full mixed
shape unstable on this Windows/Docker profile:

- `mixed5800` fails before producing usable Identity phase metrics because the
  local socket path hits buffer/queue exhaustion.
- `mixed4400` avoids the Identity socket failure, but Conversation write fails
  with connection-refused errors while Identity `revokeCycle` still owns max
  P99.
- Conversation server timing suggests the conversation database path itself is
  not the main source of the client-observed P99 in these failed runs; the gap
  is mostly outside `db.acquire`, `db.batch_wait`, and `db.insert`.

Do not enable `identitySessionDbWriteConcurrency=10` by default. The next useful
slice should diagnose runtime/process/socket pressure and Conversation gateway
liveness under the passing P67 shape before changing data semantics.

## Verification

- `node --test tools\run-system-mixed-workload-benchmark.test.mjs tools\run-system-sustained-mixed-workload.test.mjs tools\run-system-sustained-mixed-workload-scaleup.test.mjs`
- `npm run verify:structure`
- `npm run quality`
- `git diff --check`
- P68 smoke: PASSED, 0 errors, four-layer write concurrency recording verified
- P68 `mixed5800`: FAILED/BLOCKED, 7 errors, Windows socket/buffer pressure
- P68 `mixed4400`: FAILED/BLOCKED, 53 errors, Conversation connection refused
- Secret scan over P68 JSON evidence and this report found no local secret
  value or database URL
- Post-run Docker check found no `ita-identity-session` containers remaining

## Next Step

The next optimization slice should keep the P67 stable profile as the reference
and isolate why Conversation gateway liveness collapses in failed full mixed
runs even when server-side DB timing is low. Candidate directions:

- add child-process liveness and exit attribution to the system mixed report;
- compare `conversationGatewayCount`, client concurrency, and OS socket limits
  without changing product semantics;
- keep Identity write concurrency at `0` unless a lower value can pass the same
  full mixed workload with zero errors.
