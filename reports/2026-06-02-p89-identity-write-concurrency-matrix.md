# P89 Identity Write Concurrency Matrix

## 一句话结论

P89 没有改 Identity 默认运行配置。本轮把 Identity phase matrix 扩展为支持
每个 case 单独设置 `SESSION_DB_WRITE_CONCURRENCY`，并用同一次 Docker 隔离
矩阵比较了 `0/2/4/8`。

结果：在这组 128 并发、每阶段 256 次操作的 smoke 里，`writeConcurrency=0`
仍是 P99 最低的 case。写限流能显著减少 DB pool acquire wait，但会把等待转移到
应用写限流队列；本轮证据不支持把 `SESSION_DB_WRITE_CONCURRENCY=2/4/8`
直接提升为默认配置。

## 这轮完成了什么

- 新增 SDD: `docs/sdd/0180-identity-phase-matrix-case-write-concurrency.md`。
- Identity phase matrix compact case 新增 10 段格式：
  `name:gatewayCount:sessionDbMaxConns:sessionDbMinConns:sessionDbWriteConcurrency:ingressCount:clientMaxConnsPerHost:clientWarmConnectionsPerHost:ingressMaxConnsPerHost:ingressWarmConnectionsPerHost`。
- 保持旧 8 段和 9 段格式兼容，旧 case 继续继承全局
  `--session-db-write-concurrency`。
- Matrix case summary 新增：
  - `sessionDbWriteConcurrencyPerWorker`
  - `sessionDbWriteConcurrencyTotal`
- Matrix target profile 新增：
  - `caseScopedSessionDbWriteConcurrency`
  - `sessionDbWriteConcurrencyPerWorkerValues`
- 新增校验：`sessionDbWriteConcurrency > sessionDbMaxConns` 时 workload 前失败。

## Smoke 设置

| Setting | Value |
| --- | ---: |
| Case isolation | `docker-reset` |
| Concurrency | 128 |
| Operations per phase | 256 |
| Gateway workers | 2 |
| Ingress workers | 2 |
| Session DB max conns / worker | 8 |
| Session DB min conns / worker | 0 |
| Session table | `unlogged` |
| Compared write concurrency / worker | `0`, `2`, `4`, `8` |

Evidence:

- Matrix report:
  `reports/identity-phase-matrix.p89-write-concurrency-matrix-smoke.json`
- Child reports:
  - `reports/identity-phase-matrix.p89-write-concurrency-matrix-smoke.1-w0.json`
  - `reports/identity-phase-matrix.p89-write-concurrency-matrix-smoke.2-w2.json`
  - `reports/identity-phase-matrix.p89-write-concurrency-matrix-smoke.3-w4.json`
  - `reports/identity-phase-matrix.p89-write-concurrency-matrix-smoke.4-w8.json`

## Smoke Result

| Case | Write concurrency / worker | Total write concurrency | Status | Max phase P99 | Slowest phase | Total DB pool acquire | Dominant write-limiter wait |
| --- | ---: | ---: | --- | ---: | --- | ---: | ---: |
| `w0` | 0 | 0 | PASSED | 99.51 ms | `passwordLogin` | 33856.54 ms | n/a |
| `w2` | 2 | 4 | PASSED | 133.94 ms | `revokeCycle` | 9584.98 ms | 11819.64 ms |
| `w4` | 4 | 8 | PASSED | 110.57 ms | `passwordLogin` | 6903.76 ms | 11102.86 ms |
| `w8` | 8 | 16 | PASSED | 108.88 ms | `passwordLogin` | 7845.80 ms | 10616.38 ms |

Recommended case from this smoke: `w0`.

Phase detail:

| Case | `passwordLogin` P99 | `principalLookup` P99 | `refreshRotation` P99 | `revokeCycle` P99 | `revokeCycle.login` P99 | `revokeCycle.revoke` P99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `w0` | 99.51 ms | 65.30 ms | 59.73 ms | 86.21 ms | 45.53 ms | 47.98 ms |
| `w2` | 113.24 ms | 88.52 ms | 72.83 ms | 133.94 ms | 69.69 ms | 68.83 ms |
| `w4` | 110.57 ms | 66.08 ms | 53.63 ms | 96.02 ms | 48.34 ms | 47.94 ms |
| `w8` | 108.88 ms | 76.38 ms | 56.35 ms | 91.42 ms | 47.20 ms | 41.36 ms |

## 小白解释

这次测的是一个很具体的问题：写数据库时，要不要在应用里面再加一个“排队窗口”。

- `w0` 表示不额外限制写数据库并发，让数据库连接池自己排队。
- `w2/w4/w8` 表示每个 gateway worker 最多只允许 2、4、8 个写操作同时进数据库。

结果不是“限流越多越快”。它更像是把等待从一个地方搬到另一个地方：

- 不限流时，等待主要在 DB pool，所以 `Total DB pool acquire` 很大。
- 限流后，DB pool 等待下降，但应用写限流队列开始等待。
- 在这组 smoke 里，整体尾延迟 P99 最低的是 `w0`，不是 `w2/w4/w8`。

所以当前判断是：写限流可以作为保护数据库的保险丝，但还不是提升性能的默认开关。

## 和什么系统性能能比

这次只能评价 Identity 会话链路的一个中等压力 smoke，不能代表完整系统极限。

按这次数据，Identity 单模块在本机 Docker 环境、2 个 gateway worker、128 并发下，
四个阶段都能 0 错误通过，单阶段 RPS 大致在千级到数千级，P99 约 60-134 ms。
这已经不像“小玩具脚本”，更接近一个认真写过性能诊断的小型内部服务模块。

但它还不能和成熟互联网生产系统直接比，因为还缺：

- 多模块混合业务压测；
- 更长时间稳压；
- 多机器或更真实网络环境；
- 真实前端、鉴权、归档、AI worker、知识检索一起跑；
- 明确 SLO 和容量晋级门槛。

当前更准确的说法是：Identity 模块具备继续冲高并发的基础，但“全系统支持超高并发”
还不能宣布。

## 判断

P89 支持两个结论：

- `SESSION_DB_WRITE_CONCURRENCY` 需要继续作为可测配置保留。
- 默认值暂时不应该从 `0` 改成 `2/4/8`。

下一步如果继续优化，优先不是调大写限流，而是做更贴近根需求的混合 workload：

- 登录、刷新、撤销、principal lookup 的真实比例；
- teaching archive 读写；
- conversation write；
- knowledge retrieval；
- agent harness 审批/证据写入；
- 长稳压下的 P99 漂移和错误率。

## 质量门禁

Focused tests:

- `node --test tools/run-identity-phase-matrix.test.mjs`
- `npm run verify:structure`
- `git diff --check`

Full gate:

- `npm run quality` passed.

Operational checks:

- P89 Docker-isolated smoke passed.
- Docker residual container check passed.
