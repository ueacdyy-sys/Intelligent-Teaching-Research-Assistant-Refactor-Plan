# P66 Teaching Quiz Submission Fast Insert

## Summary

P66 optimized the Teaching Archive quiz submission success path after P65 showed
Teaching Archive had become the full mixed workload max P99 contributor.

The change keeps the public HTTP contract and domain authorization semantics,
but lets the Postgres repository conditionally insert a quiz submission through
one parameterized `INSERT ... SELECT ... WHERE` statement when the caller is
already authorized for a known teaching quiz. Fast-path misses fall back to the
old archive lookup path so missing items and non-quiz items preserve their
prior errors.

Result: both focused Teaching Archive evidence and the full `mixed5800` system
run passed with zero errors.

## Focused Command

```powershell
npm run bench:teaching-archive:pgbouncer -- --out reports/teaching-archive-benchmark.p66-quiz-submission-fast-insert.json --concurrency 290 --operations 580 --db-max-conns 1 --timeout-ms 10000 --startup-timeout-ms 180000
```

## Focused Result

| Phase | P95 | P99 | Errors | RPS |
| --- | ---: | ---: | ---: | ---: |
| createArchiveItem | 1203ms | 1285ms | 0 | 220.7 |
| createQuizSubmission | 1306ms | 1308ms | 0 | 226.56 |
| listArchiveItems | 913ms | 917ms | 0 | 320.09 |

Focused report:

- `reports/teaching-archive-benchmark.p66-quiz-submission-fast-insert.json`

## Full Mixed Command

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --out reports/system-sustained-mixed-workload-scaleup.p66-teaching-quiz-fast-insert-mixed-5800.json --step-prefix reports/system-sustained-mixed-workload-scaleup.p66-teaching-quiz-fast-insert-mixed-5800 --profile SUSTAINED_SCALEUP_P66_TEACHING_QUIZ_FAST_INSERT_MIXED_5800 --manage-docker true --docker-cleanup reset --stop-on-failure true --steps mixed5800:5800:11600:5800:11600:290:580 --samples 1 --sample-interval-ms 0 --identity-gateway-count 12 --conversation-gateway-count 16 --identity-session-db-max-conns 10 --conversation-db-max-conns 1 --teaching-db-max-conns 1 --conversation-write-batch-size 64 --max-conns-per-host 300 --warm-connections-per-host 75 --identity-max-conns-per-host 150 --identity-warm-connections-per-host 150 --identity-ingress-proxy true --identity-ingress-port 19080 --identity-ingress-count 16 --identity-ingress-max-conns-per-host 40 --identity-ingress-warm-connections-per-host 16 --timeout 2400s --startup-timeout-ms 180000 --max-p99-ms 3000 --max-p99-drift-ms 1000
```

## Full Mixed Reports

- `reports/system-sustained-mixed-workload-scaleup.p66-teaching-quiz-fast-insert-mixed-5800.json`
- `reports/system-sustained-mixed-workload-scaleup.p66-teaching-quiz-fast-insert-mixed-5800.1-mixed5800.json`
- `reports/system-sustained-mixed-workload-scaleup.p66-teaching-quiz-fast-insert-mixed-5800.1-mixed5800.1.json`
- `reports/system-sustained-mixed-workload-scaleup.p66-teaching-quiz-fast-insert-mixed-5800.1-mixed5800.1.identity-http.json`
- `reports/system-sustained-mixed-workload-scaleup.p66-teaching-quiz-fast-insert-mixed-5800.1-mixed5800.1.conversation-write.json`
- `reports/system-sustained-mixed-workload-scaleup.p66-teaching-quiz-fast-insert-mixed-5800.1-mixed5800.1.teaching-archive.json`
- matching knowledge retrieval and AI admission child reports

## Full Mixed Result

| Step | Status | Identity concurrency | Conversation concurrency | Teaching concurrency | Max P99 | Identity P99 | Conversation P99 | Teaching P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| mixed5800 | PASSED/PASSED | 5800 | 5800 | 290 | 2217.59ms | 2217.59ms | 883.78ms | 1360ms | 0 |

Rollup summary:

```text
highestPassedStep=mixed5800
firstBlockedStep=none
totalErrors=0
maxP95=2183.25ms
maxP99=2217.59ms
maxP99Drift=0ms
```

## Teaching Archive Reading

| Phase | P65 P99 | P66 P99 | P66 Errors |
| --- | ---: | ---: | ---: |
| createArchiveItem | 1539ms | 1139ms | 0 |
| createQuizSubmission | 2413ms | 1149ms | 0 |
| listArchiveItems | 778ms | 1360ms | 0 |
| Teaching max | 2413ms | 1360ms | 0 |

The targeted write path moved from the slowest Teaching phase to roughly the
same range as archive creation. In the full mixed run, the Teaching Archive max
P99 moved to `listArchiveItems`, while the system max P99 moved back to Identity
`revokeCycle`.

## Comparison

| Evidence | Status | Max P99 | Identity P99 | Teaching P99 | Teaching quiz submission P99 | Errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| P65 mixed5800 bearer affinity | PASSED | 2413ms | 2291.47ms | 2413ms | 2413ms | 0 |
| P66 focused Teaching Archive | PASSED | 1308ms | n/a | 1308ms | 1308ms | 0 |
| P66 mixed5800 fast insert | PASSED | 2217.59ms | 2217.59ms | 1360ms | 1149ms | 0 |

## Interpretation

P66 confirms the read/write bottleneck analysis for quiz submissions. Removing
the success-path archive read materially reduces queue pressure when Teaching
Archive runs with one database connection under the mixed workload profile.

This does not prove the whole system supports unrestricted ultra-high
concurrency. It is a stronger single-sample `mixed5800` result and should be
treated as scale-up evidence only until root SLO promotion evidence is repeated
and accepted.

## Verification

- `go test ./services/teaching-archive-gateway/internal/usecase -run TestCreateQuizSubmission -count=1`
- `go test ./services/teaching-archive-gateway/internal/adapter/postgres -run QuizSubmission -count=1`
- `go test ./services/teaching-archive-gateway/... -count=1`
- `npm run verify:structure`
- `npm run quality`

## Next Step

The next practical system bottleneck is again Identity `revokeCycle` at
`2217.59ms` P99. Before increasing the concurrency envelope, rerun `mixed5800`
with multiple samples or run the root SLO promotion shape, then investigate
Identity revoke DB queue and ingress stability under repeated pressure.
