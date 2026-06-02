# P84 Identity System-Shape Min Connections Matrix

## 一句话结论

P84 把 P83 的 `min8` 候选放到更接近当前系统形态的 4400 负载里复测。
结果是：**没有一个配置同时赢下“更低尾延迟”和“更少连接池等待”**。

最好的 P99 是 `g12-p12-min0-i16-c150`，但它的连接池等待比基线更高；
`g12-p10-min0-i16-c150` 仍然是更稳的基线。
所以这轮**不改默认配置**。

## 测试方式

| Setting | Value |
| --- | ---: |
| Case isolation | `docker-reset` |
| Concurrency | 4400 |
| Operations per phase | 8800 |
| Gateway workers | 12 |
| Ingress workers | 16 |
| Client max/warm per host | 150 / 150 |
| Ingress max/warm per host | 40 / 16 |

Evidence:

- SDD: `docs/sdd/0175-identity-system-shape-min-conns-matrix.md`
- Matrix report: `reports/identity-phase-matrix.p84-system-shape-min-conns.json`
- Child reports:
  - `reports/identity-phase-matrix.p84-system-shape-min-conns.1-g12-p10-min0-i16-c150.json`
  - `reports/identity-phase-matrix.p84-system-shape-min-conns.2-g12-p10-min8-i16-c150.json`
  - `reports/identity-phase-matrix.p84-system-shape-min-conns.3-g12-p12-min0-i16-c150.json`
  - `reports/identity-phase-matrix.p84-system-shape-min-conns.4-g12-p12-min8-i16-c150.json`

## 结果表

| Case | Max conns / worker | Min conns / worker | Status | Errors | Max phase P99 ms | Total pool acquire ms | vs baseline P99 | vs baseline acquire |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| `g12-p10-min0-i16-c150` | 10 | 0 | PASSED | 0 | 2158.17 | 12891163.82 | 0.00% | 0.00% |
| `g12-p10-min8-i16-c150` | 10 | 8 | PASSED | 0 | 2119.81 | 14089453.10 | -1.78% | +9.30% |
| `g12-p12-min0-i16-c150` | 12 | 0 | PASSED | 0 | 2105.50 | 13969931.78 | -2.44% | +8.37% |
| `g12-p12-min8-i16-c150` | 12 | 8 | PASSED | 0 | 2174.00 | 14217962.74 | +0.73% | +10.29% |

Runner recommendation: `g12-p12-min0-i16-c150`

But the SDD gate says a config change is only valid when both P99 and pool wait improve.
That did not happen here.

## 小白解释

这次不是看一个“空接口”，而是看真正会碰数据库的高压路径：
登录、查权限、刷新、撤销。

- `P99` 可以理解成“几乎所有请求里最慢的那 1% 的上限”。
- `Total pool acquire` 可以理解成“所有请求合起来，一共等了多久数据库窗口”。

这轮里，`g12-p12-min0` 的单次尾延迟最好一点，但大家总共排队更多了。
这就像把窗口开多了，单个人可能稍快，但全队排队并没有一起变短。

所以这轮给出的不是“立刻上默认”的答案，而是：

- Identity 还能继续优化
- 但还没有到能靠这个配置直接宣称超高并发的程度

## 现在能怎么判断系统

结合 P77 的全系统 mixed1600 和这轮 P84：

- 已经明显不是 demo 级别
- 更像单机/小集群里的中高并发业务系统
- 还不能和大型互联网核心系统比

原因不是“功能不够”，而是还缺长时间稳定性、多机拓扑、真实故障恢复和更完整的容量晋级证据。

## 结论

P84 的价值是把“min8 候选”放到了更像系统真身的压力下验证。
结论很克制：

- 没有达到修改默认配置的门槛
- 但已经把下一步该盯的点缩小到 `revokeCycle.revokeOwnSession`
- 下一轮应该继续围绕撤销路径做更深的数据库与池等待归因
