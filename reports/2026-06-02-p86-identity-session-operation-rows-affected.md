# P86 Identity Session Operation Rows Affected

## 一句话结论

P86 给 Identity session 写操作补上了 `rowsAffected` 诊断，并用 Docker
隔离 smoke 证明字段已经从 Gateway 一路流到 phase matrix 汇总。

本轮没有改业务语义，也没有改 SQL/index/worker/pool 默认值。

最关键的结果是：`revokeCycle.revokeOwnSession` 在 smoke 中 **256 次执行、
影响 256 行，平均每次 1 行**。所以当前 revoke 写瓶颈不是“没删到行”或
“空跑”，而是每次都命中后仍然主要卡在连接池等待。

## 这轮完成了什么

- Session operation timing stats 新增：
  - `rowsAffectedCount`
  - `rowsAffected`
  - `averageRowsAffected`
- Gateway DB diagnostics delta 透传 row-impact 字段。
- Identity phase matrix operation summary 保留 row-impact 字段。
- System Identity phase summary 合并 row-impact 字段。
- 新增 SDD: `docs/sdd/0177-identity-session-operation-rows-affected.md`。

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

- Matrix report: `reports/identity-phase-matrix.p86-rows-affected-smoke.json`
- Child report:
  `reports/identity-phase-matrix.p86-rows-affected-smoke.1-g2-p8-rows-i2-c64.json`

## Smoke Result

| Metric | Value |
| --- | ---: |
| Status | PASSED |
| Max phase P99 | 121.52 ms |
| Errors | 0 |
| Total pool acquire | 32937.48 ms |

`revokeCycle.revokeOwnSession`:

| Metric | Value |
| --- | ---: |
| Count | 256 |
| Average elapsed | 30.51 ms |
| Average pool acquire | 26.84 ms |
| Pool acquire share | 0.88 |
| Average DB execute | 3.66 ms |
| DB execute share | 0.12 |
| Rows affected count | 256 |
| Rows affected | 256 |
| Average rows affected | 1 |

## 小白解释

以前我们只知道“撤销很慢”，但不知道它是不是经常没删到东西。

现在这轮告诉我们：每次撤销都确实删到了 1 条 session。
所以问题不是“撤销请求打空了”，而是“大家都在等数据库窗口”。

这会改变下一步方向：

- 不应该先改撤销条件去追求命中率；
- 也不应该只靠继续调大 pool；
- 更该研究怎么减少 revokeCycle 里的同步写、怎么拆读写路径，或怎么做更合理的写调度。

## 判断

P86 把 `revokeOwnSession` 的瓶颈边界又缩小了一层：

- row impact 正常；
- DB execute 仍然不是主要耗时；
- pool acquire 仍然占 `0.88`。

所以当前 Identity 写路径的主要优化方向仍然是连接排队和写路径结构，而不是
DELETE 没命中或 SQL 本身慢。

## 质量门禁

Focused tests:

- `go test ./services/identity-access-gateway/internal/adapter/postgres -run "OperationTiming" -count=1`
- `go test ./services/identity-access-gateway/cmd/httpbench -run "GatewayDatabasePhaseDiagnosticsDelta" -count=1`
- `node --test tools/run-identity-phase-matrix.test.mjs tools/system-identity-phase-summary.test.mjs`
- `npm run verify:structure`

Full gate:

- `npm run quality` passed after moving DB operation measurement helpers into a
  separate same-package file, keeping `session_store.go` under the 800-line
  quality limit.
