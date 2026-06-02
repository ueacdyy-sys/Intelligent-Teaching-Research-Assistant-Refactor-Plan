# P87 Identity Phase Write Limiter Pressure

## 一句话结论

P87 把 Identity phase diagnostics 里的写限流压力补齐了：现在 phase matrix
不仅能看到 DB pool 等待，也能看到应用写队列等待，并能定位到具体 session
写操作。

本轮没有改业务语义，也没有改 SQL/index/worker/pool/PgBouncer/PostgreSQL 默认
配置。`SESSION_DB_WRITE_CONCURRENCY=2` 只用于 smoke 诊断，不作为默认值。

关键结果：当每个 Gateway worker 只允许 2 个 session 写并发时，DB pool 等待
明显下降，但等待转移到了应用写队列。最重的写队列等待出现在
`revokeCycle.revokeOwnSession`。

## 这轮完成了什么

- Gateway phase diagnostics 新增 `delta.writeLimiter`。
- Phase-level write limiter delta 记录：
  - `enabledGateways`
  - `configuredLimitTotal`
  - `acquireCount`
  - `acquireWaitTimeMs`
  - `averageAcquireWaitTimeMs`
  - per-operation acquire wait
- Identity phase matrix 汇总：
  - phase-level `writeLimiter`
  - `highestWriteLimiterWaitOperation`
  - `dominantWriteLimiterWaitPhase`
  - `dominantWriteLimiterWaitOperation`
- System Identity phase summary 保留并合并 write-limiter pressure。
- 新增 SDD: `docs/sdd/0178-identity-phase-write-limiter-pressure.md`。

## 测试方式

| Setting | Value |
| --- | ---: |
| Case isolation | `docker-reset` |
| Concurrency | 128 |
| Operations per phase | 256 |
| Gateway workers | 2 |
| Ingress workers | 2 |
| Session DB max conns / worker | 8 |
| Session DB min conns / worker | 0 |
| Session DB write concurrency / worker | 2 |
| Session DB write concurrency total | 4 |
| Session table | `unlogged` |

Evidence:

- Matrix report:
  `reports/identity-phase-matrix.p87-write-limiter-pressure-smoke.json`
- Child report:
  `reports/identity-phase-matrix.p87-write-limiter-pressure-smoke.1-g2-p8-w2-i2-c64.json`

## Smoke Result

| Metric | Value |
| --- | ---: |
| Status | PASSED |
| Max phase P99 | 148.10 ms |
| Errors | 0 |
| Total DB pool acquire | 8526.18 ms |
| Dominant write-limiter phase | `revokeCycle` |
| Dominant write-limiter operation | `revokeOwnSession` |
| Dominant operation write-limiter wait | 14069.10 ms |

Phase write-limiter pressure:

| Phase | Phase P99 | DB pool acquire | Write-limiter wait | Dominant operation |
| --- | ---: | ---: | ---: | --- |
| `passwordLogin` | 109.00 ms | 11.82 ms | 12957.47 ms | `saveSession` |
| `principalLookup` | 74.63 ms | 8514.36 ms | 0 ms | n/a |
| `refreshRotation` | 74.24 ms | 0 ms | 11705.16 ms | `rotateRefreshSession` |
| `revokeCycle` | 148.10 ms | 0 ms | 24791.88 ms | `revokeOwnSession` |

`revokeCycle` operation breakdown:

| Operation | Acquire count | Write-limiter wait | Average wait |
| --- | ---: | ---: | ---: |
| `revokeOwnSession` | 256 | 14069.10 ms | 54.96 ms |
| `saveSession` | 256 | 10722.78 ms | 41.89 ms |

## 小白解释

P86 告诉我们：撤销 session 每次确实删到了 1 行，不是“请求打空”。

P87 又补了一层：当我们人为限制写入窗口时，数据库窗口不怎么排队了，但应用
自己的写入窗口开始排队。也就是说，系统慢点不是凭空消失了，而是从“等数据库
连接”搬到了“等应用写槽位”。

这说明下一步不能只说“开写限流就优化了”。更准确的方向是：

- 减少 `revokeCycle` 里的同步写压力；
- 优先分析 `revokeCycle` 里 `saveSession + revokeOwnSession` 的组合写放大；
- 再比较不启用写限流、低写限流、高写限流在更大系统形状下的 P99 和队列位置。

## 判断

P87 支持 P25-P27 的判断：写限流是有价值的诊断/保护工具，但不是默认性能优化。

它能把 DB pool wait 压下去，可是会把等待转移到 write limiter。除非后续证据
同时改善 P99、总时长、DB pool wait、write-limiter wait，否则不应该把
`SESSION_DB_WRITE_CONCURRENCY` 提升为默认配置。

## 质量门禁

Focused tests:

- `go test ./services/identity-access-gateway/cmd/httpbench -run "GatewayDatabasePhaseDiagnosticsDelta" -count=1`
- `node --test tools/run-identity-phase-matrix.test.mjs tools/system-identity-phase-summary.test.mjs`
- `npm run verify:structure`

Full gate:

- `npm run quality` passed.
