# P88 Identity Revoke Cycle Step Operation Attribution

## 一句话结论

P88 没改业务语义，也没改默认 worker、pool、PgBouncer 或 PostgreSQL 配置。
本轮新增的是 `revokeCycle` 的步骤级归因：现在能直接看出 `login` 对应
`saveSession`，`revoke` 对应 `revokeOwnSession`，以及撤销后的 principal
lookup 是否仍然打到数据库。

结论更清楚了：在 `SESSION_DB_WRITE_CONCURRENCY=2` 的诊断烟测里，
`revokeCycle` 的数据库执行本身很快，真正排队的位置是应用写限流窗口。

## 这轮完成了什么

- Raw httpbench report 新增 `revokeCycle.stepOperationAttribution`。
- Identity phase matrix 保留步骤级操作归因。
- System Identity phase summary 保留并合并步骤级操作归因。
- 新增 SDD: `docs/sdd/0179-identity-revoke-cycle-step-operation-attribution.md`。
- 新增 Go/Node 红测，覆盖 raw report、phase matrix、system summary 三层。

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
| Session DB write concurrency / worker | 2 |
| Session DB write concurrency total | 4 |
| Session table | `unlogged` |

Evidence:

- Matrix report:
  `reports/identity-phase-matrix.p88-step-operation-attribution-smoke.json`
- Child report:
  `reports/identity-phase-matrix.p88-step-operation-attribution-smoke.1-g2-p8-w2-i2-c64.json`

## Smoke Result

| Metric | Value |
| --- | ---: |
| Status | PASSED |
| Max phase P99 | 137.09 ms |
| Errors | 0 |
| Total DB pool acquire | 10004.78 ms |
| Dominant write-limiter phase | `revokeCycle` |
| Dominant write-limiter operation | `revokeOwnSession` |
| Dominant operation write-limiter wait | 13400.43 ms |

Phase pressure:

| Phase | Phase P99 | RPS | DB pool acquire | Write-limiter wait | Dominant write-limiter operation |
| --- | ---: | ---: | ---: | ---: | --- |
| `passwordLogin` | 100.47 ms | 1570.58 | 15.48 ms | 12879.29 ms | `saveSession` |
| `principalLookup` | 87.67 ms | 2082.53 | 9988.25 ms | n/a | n/a |
| `refreshRotation` | 77.00 ms | 1837.10 | 0.54 ms | 12326.11 ms | `rotateRefreshSession` |
| `revokeCycle` | 137.09 ms | 1045.09 | 0.51 ms | 23492.11 ms | `revokeOwnSession` |

`revokeCycle` step attribution:

| Step | Step P99 | Step avg | Operation | Count | Rows affected | Avg DB execute | Write-limiter wait | Avg limiter wait |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| `login` | 70.88 ms | 46.89 ms | `saveSession` | 256 | 256 | 1.91 ms | 10091.68 ms | 39.42 ms |
| `revoke` | 70.56 ms | 57.30 ms | `revokeOwnSession` | 256 | 256 | 1.72 ms | 13400.43 ms | 52.35 ms |
| `revokedPrincipalLookup` | 7.81 ms | 2.61 ms | `getPrincipalByAccessToken` | missing | n/a | n/a | n/a | n/a |

## 小白解释

这轮不是把系统“调快了”，而是把慢在哪里标出来了。

之前只能看到整个 `revokeCycle` 慢，现在能拆成三步：

- 登录这一步会写入 session，也就是 `saveSession`。
- 撤销这一步会删除自己的 session，也就是 `revokeOwnSession`。
- 撤销后再查 principal 时，这次没有看到 `getPrincipalByAccessToken` 数据库操作，
  说明这一步大概率被撤销 token 的 deny cache 挡住了，没有再查数据库。

所以当前证据不支持“撤销后的查询拖慢系统”。更像是：压测场景里每次 revoke
cycle 都先登录再撤销，形成 `saveSession + revokeOwnSession` 两次同步写。
当写并发被限制到每个 worker 2 个时，数据库执行只要 1-2 ms，但应用写队列
等几十 ms。

## 判断

P88 支持继续优化，但不支持盲目把 `SESSION_DB_WRITE_CONCURRENCY=2` 设为默认。
它能保护 DB pool，但会把等待转移到应用写队列。

下一步应该比较 `writeConcurrency=0/2/4/8` 的相同场景，并重点看：

- P99 是否真的下降；
- DB pool wait 和 write-limiter wait 有没有同时下降；
- `revokeCycle` 的 `saveSession + revokeOwnSession` 写放大能不能减少；
- 长稳压测下是否还能保持 0 错误。

## 质量门禁

Focused tests:

- `go test ./services/identity-access-gateway/cmd/httpbench -count=1`
- `node --test tools/run-identity-phase-matrix.test.mjs tools/system-identity-phase-summary.test.mjs`
- `npm run verify:structure`
- `git diff --check`

Full gate:

- `npm run quality` passed.

Operational checks:

- P88 smoke passed.
- Docker residual container check passed.
- Generated P88 evidence secret scan passed.
