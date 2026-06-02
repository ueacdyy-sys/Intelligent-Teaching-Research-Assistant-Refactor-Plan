# P85 Identity Session Query Exec Mode Profile

## 一句话结论

P85 把 pgx 的 `SESSION_DB_QUERY_EXEC_MODE` 做成了可测配置，并用 Docker
隔离小矩阵测了 5 种模式。

结论很直接：**默认 `cache_statement` 仍然最好，暂不改默认配置。**

`cache_describe` 能跑通，但没有同时改善 P99 和连接池等待；
`exec`、`simple_protocol`、`describe_exec` 在当前会话写入路径下会导致登录失败，
不能作为性能候选。

## 这轮完成了什么

- Identity Gateway 新增 `SESSION_DB_QUERY_EXEC_MODE`。
- HTTP benchmark 会把该配置传给每个 gateway worker。
- HTTP benchmark 和 phase matrix 报告都会记录
  `gatewayDatabaseProfile.sessionDbQueryExecMode`。
- phase matrix 会在目标 profile 和每个 case config 里记录 query exec mode。
- 新增 SDD: `docs/sdd/0176-identity-session-query-exec-mode-profile.md`。

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
| Session table | `unlogged` |

Evidence:

- `reports/identity-phase-matrix.p85-query-exec-cache-statement-smoke.json`
- `reports/identity-phase-matrix.p85-query-exec-cache-describe-smoke.json`
- `reports/identity-phase-matrix.p85-query-exec-exec-smoke.json`
- `reports/identity-phase-matrix.p85-query-exec-simple-protocol-smoke.json`
- `reports/identity-phase-matrix.p85-query-exec-describe-exec-smoke.json`

## 结果表

| Mode | Status | Max phase P99 ms | Total pool acquire ms | Result |
| --- | --- | ---: | ---: | --- |
| `cache_statement` | PASSED | 114.06 | 36870.52 | Baseline |
| `cache_describe` | PASSED | 114.40 | 37416.12 | Slower tail and more pool wait |
| `exec` | FAILED | n/a | n/a | Login returned 500 |
| `simple_protocol` | FAILED | n/a | n/a | Login returned 500 |
| `describe_exec` | FAILED | n/a | n/a | Login returned 500 |

Against the default:

- `cache_describe` P99 was `+0.30%`.
- `cache_describe` total pool acquire wait was `+1.48%`.
- The other modes did not reach a valid performance result.

## 小白解释

可以把 PostgreSQL 执行模式理解成“服务员怎么把点菜单交给厨房”：

- 默认 `cache_statement`：厨房记住这类菜单，下次更快处理。
- `cache_describe`：厨房记住菜单结构，但不完全缓存点菜单。
- `exec/simple_protocol/describe_exec`：换了交菜单方式，但当前这套菜品里有
  `principal_json` 这种 JSON 数据，登录写入时就出错了。

这轮说明：慢不慢不是只看“开几个窗口”，还要看“窗口内部用什么流程”。
但这一次换流程没有带来收益，所以不能为了看起来高级就改配置。

## 判断

这轮排除了一个重要假设：**当前 Identity 写路径的主要瓶颈，不是 pgx 默认
`cache_statement` 和 PgBouncer 不搭导致的。**

更可信的后续方向仍然是：

- 继续减少撤销周期里的同步 DB 写次数。
- 研究 `revokeOwnSession` 的排队来源。
- 把读写路径拆得更清楚，而不是继续盲目调 pool/worker。

## 配置决策

不修改默认配置。

`cache_statement` 保持当前默认，因为它在本轮小矩阵里：

- 唯一稳定通过所有阶段并且指标最好的模式；
- 相比 `cache_describe` 有更低 P99；
- 相比 `cache_describe` 有更少连接池等待。

## 质量门禁

Focused tests:

- `go test ./services/identity-access-gateway/cmd/gateway -run "QueryExecMode|SessionDB" -count=1`
- `node --test tools/run-identity-http-benchmark.test.mjs tools/run-identity-phase-matrix.test.mjs`

The full quality gate is recorded separately before commit.
