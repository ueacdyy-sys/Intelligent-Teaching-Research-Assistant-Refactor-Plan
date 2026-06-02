# P83 Identity Isolated Pool Shape Matrix

## 一句话结论

本轮 P83 跑完后，4 个隔离测试全部 `PASSED`，错误数都是 `0`。在这组
小矩阵里，`2 个 Identity gateway worker + 每 worker 最大 12 条 session
数据库连接 + 每 worker 预热 8 条连接` 是最好的候选形态：

- 最大阶段 P99：`95.89ms`
- 总连接池等待：`29092.35ms`
- 主瓶颈：`revokeCycle.revokeOwnSession`

这比本轮对照组 `pool max=8, min=0` 同时改善了两件事：

- P99 从 `113.9ms` 降到 `95.89ms`，下降约 `15.8%`
- 总连接池等待从 `34009.44ms` 降到 `29092.35ms`，下降约 `14.5%`

这说明 `pool max=12, min=8` 值得进入下一轮更大矩阵验证；但它还不是
生产默认配置，因为这仍然只是 Identity 模块的短跑隔离测试，不是全系统
长时间容量证明。

## 测试方式

本轮使用 P82 新增的隔离能力：每个 case 之前都重置并重启 Docker 内的
PostgreSQL/PgBouncer 环境，减少“后跑的 case 天然更快”的顺序误差。

| Setting | Value |
| --- | ---: |
| Case isolation | `docker-reset` |
| Benchmark runtime | Docker Go load generator |
| Gateway workers | 2 |
| Ingress workers | 2 |
| Concurrency | 128 |
| Operations per phase | 256 |
| Session table persistence | `unlogged` |
| Docker cleanup | `reset` |

Evidence:

- SDD: `docs/sdd/0174-identity-isolated-pool-shape-matrix.md`
- Matrix report: `reports/identity-phase-matrix.p83-isolated-pool-shape-smoke.json`
- Child reports:
  - `reports/identity-phase-matrix.p83-isolated-pool-shape-smoke.1-g2-p8-min0-i2-c64.json`
  - `reports/identity-phase-matrix.p83-isolated-pool-shape-smoke.2-g2-p8-min8-i2-c64.json`
  - `reports/identity-phase-matrix.p83-isolated-pool-shape-smoke.3-g2-p12-min0-i2-c64.json`
  - `reports/identity-phase-matrix.p83-isolated-pool-shape-smoke.4-g2-p12-min8-i2-c64.json`

## 结果表

| Case | Max conns / worker | Min conns / worker | Status | Errors | Max phase P99 ms | Total pool acquire ms | Dominant pool wait |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| `g2-p8-min0-i2-c64` | 8 | 0 | PASSED | 0 | 113.90 | 34009.44 | `revokeCycle.revokeOwnSession` |
| `g2-p8-min8-i2-c64` | 8 | 8 | PASSED | 0 | 103.17 | 33897.01 | `passwordLogin.saveSession` |
| `g2-p12-min0-i2-c64` | 12 | 0 | PASSED | 0 | 109.76 | 30747.35 | `revokeCycle.revokeOwnSession` |
| `g2-p12-min8-i2-c64` | 12 | 8 | PASSED | 0 | 95.89 | 29092.35 | `revokeCycle.revokeOwnSession` |

Best case phase detail:

| Phase | P99 ms | RPS | Errors |
| --- | ---: | ---: | ---: |
| password login | 95.89 | 1673.32 | 0 |
| principal lookup | 54.12 | 3143.73 | 0 |
| refresh rotation | 63.76 | 2451.68 | 0 |
| revoke cycle | 95.41 | 1681.41 | 0 |

## 小白解释

可以把数据库连接池理解成“去数据库窗口办事的排队通道”。

- `P99=95.89ms` 的意思是：这轮最好的配置里，99% 的请求基本都能在
  `0.096 秒`以内完成。
- `Total pool acquire ms` 的意思是：所有请求加起来，一共花了多少时间
  在“等数据库窗口”。这个数字越低，说明大家排队越少。
- 本轮最好的配置不是单纯把窗口越开越多，而是“最大窗口数增加到 12，
  并提前预热 8 个窗口”，所以冷启动和排队都更稳。

但还要谨慎：本轮是短时间、单模块、实验室环境压测。它证明“这个配置在
Identity 模块里值得继续测”，不证明“整个系统已经能承受超高并发上线流量”。

## 已完成的架构模块

这里的“完成”指当前重构仓库里已经有契约、测试、审计或性能证据的可执行
架构切片，不等于完整产品所有界面和业务都已最终交付。

| Architecture module | Current evidence status | What it means |
| --- | --- | --- |
| Root requirements trace | READY | 根本需求已被映射到重构边界，HTML 架构板不是唯一依据 |
| Identity and access boundary | PASSED in P77/P83 | 登录、会话、权限上下文、撤销和访问边界已经是核心热路径 |
| Research conversation write | PASSED in P77 | 对话写入网关、批量写入和性能证据已经成型 |
| Teaching archive and quiz | PASSED in P77 | 教学归档、测验提交等教学数据入口已有压测证据 |
| Knowledge retrieval policy | READY in P77 | 知识检索策略/门禁已经在混合负载报告中纳入 |
| AI worker admission | READY in P77 | AI 任务准入有审计门禁，重依赖不进入基线运行时 |
| Student app contract slices | SDD-covered | 学生档案、资料、AI tutor、题库、扫码答题等接口边界已切片 |
| Agent Harness and workflow/plugin gate | SDD-covered | 外部控制、插件/工作流草稿、测试和人工审批边界已切片 |
| Performance evidence framework | PASSED | 已有混合负载、阶段归因、Docker/WSL/local 运行时和连接池矩阵证据 |

## 和什么系统性能相近

按目前证据，系统不能和大型互联网核心系统相比，比如全国级支付、短视频、
电商秒杀、搜索引擎这类多机房、多区域、海量用户系统。原因很简单：我们还
没有多机房、长时间、真实公网、真实用户分布、自动扩缩容和灾备证据。

更合理的自评是：

- 已经超过“普通脚手架 demo / 空接口 demo”的层级，因为测的是登录、查权限、
  刷新、撤销、对话写入、教学归档等真实路径，而且有 `0 errors` 证据。
- 接近“单机或小集群的中高并发业务 API 原型/内测系统”层级：P77 的
  `mixed1600` 全系统混合负载里，系统 P99 为 `657.79ms`，Identity RPS 为
  `2648.78`，Conversation RPS 为 `10483.46`，错误数 `0`。
- 对学校、教研机构、内部 AI 工具、知识库/教研工作流这类场景，目前数据已经
  显示出可继续工程化的底子。
- 对“超高并发生产系统”还不能盖章。下一步必须做更大矩阵、长时间稳定性、
  磁盘持久化配置、真实部署拓扑和容量晋级门禁。

## Interpretation

- P83 is the first isolated matrix in this series where the recommended case
  improves both max phase P99 and total local pool acquire pressure.
- The dominant bottleneck still has not disappeared: `revokeOwnSession` remains
  a controlling operation in the revoke-heavy path.
- The correct next step is a larger isolated matrix that repeats or reverses
  the `pool max=12, min=8` candidate against the current system shape before
  changing defaults.
- Do not promote PgBouncer/PostgreSQL limits, gateway worker counts, or write
  concurrency based on this smoke alone.

## Verification

Passed gate:

```text
node --test tools\run-identity-http-benchmark.test.mjs tools\run-identity-phase-matrix.test.mjs
npm run verify:structure
npm run quality
git diff --check
generated report secret scan
Docker residual container check: no running containers
```
