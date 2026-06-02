# P90 Root SLO Production RPS Target

## 一句话结论

P90 没有声称系统已经达到万级 RPS。本轮完成的是把目标机器化：
root SLO promotion review 现在明确审查
`FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS`，目标是持续混合读写
`10000 RPS`，并把顶尖交互 P99 目标收紧到 `300 ms`。

当前审计结论仍然是 `BLOCK_PROMOTION`。这很重要：系统可以继续重构和优化，
但不能把模块峰值、短烟测、或者没有 RPS 指标的报告包装成生产万级 RPS。

## 这轮完成了什么

- 新增 SDD: `docs/sdd/0181-root-slo-production-rps-target.md`。
- Root SLO promotion policy 新增：
  - `reviewedClaim=FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS`
  - `productionReadWriteRpsTarget=10000`
  - `interactiveP99TargetMs=300`
- Root SLO promotion evidence 新增 `productionThroughput`。
- Root SLO promotion findings 新增
  `promotion.production_read_write_rps_target_met`。
- System capacity claim audit 的可读输出同步为生产 10k RPS 口径。
- 重新生成：
  - `reports/root-slo-promotion-review.current.json`
  - `reports/system-capacity-claim.current.json`

## Current Root SLO Result

| Item | Value |
| --- | --- |
| Readiness | READY |
| Decision | BLOCK_PROMOTION |
| Reviewed claim | `FULL_SYSTEM_PRODUCTION_READ_WRITE_10000_RPS` |
| Production read/write target | 10000 RPS |
| Interactive P99 target | 300 ms |
| Measured production read/write RPS | missing |
| Claim status | `NOT_SUPPORTED_BY_CURRENT_ROOT_SLO_REVIEW` |

Promotion blockers:

| Blocker | Current evidence | Required |
| --- | --- | --- |
| Runtime workflow coverage | `workflow_plugin_self_evolution` is still contract-only | no contract-only root workflows |
| Module evidence depth | Teaching, Knowledge, AI worker, Agent/Workflow still shallow | all root modules need runtime SLO evidence |
| Interactive tail latency | Identity slowest P99 is 3071.17 ms | max root P99 <= 300 ms |
| Sustained scale depth | highest sustained step is `low` | highest sustained step >= `high` |
| Production read/write RPS | missing | measured sustained read/write RPS >= 10000 |

Required next evidence:

- `ROOT_WORKFLOW_RUNTIME_SLO_COVERAGE`
- `MODULE_RUNTIME_SLO_DEPTH_FOR_TEACHING_KNOWLEDGE_WORKER_AGENT`
- `ROOT_INTERACTIVE_TAIL_LATENCY_REMEDIATION`
- `HIGHER_SUSTAINED_MIXED_WORKLOAD_STEP`
- `PRODUCTION_10000_RPS_SUSTAINED_EVIDENCE`

## 小白解释

以前报告里说的是“超高并发”，这个词太宽。P90 把它改成了更硬的目标：

- 一秒钟要能稳定处理一万级读写请求；
- 用户交互的 P99 要压到 300 ms 内；
- 这个结论必须来自持续混合业务压测，不是单模块峰值；
- 没有测出来就显示 missing，不允许脑补。

这相当于给系统上了一道更严的验收门。以后每个模块优化完，都要问：
它有没有减少 5 个 blocker 里的某一个？有没有让 10k RPS 的证据更接近？

## 判断

P90 是目标门禁模块，不是性能提升模块。它的价值是防止方向跑偏。

当前离生产万级 RPS 还差：

- 把 workflow/plugin 从 contract-only 提升到 runtime SLO；
- 把 Teaching/Knowledge/AI worker/Agent 这些浅证据补成可压测证据；
- 把 Identity 3071.17 ms 的最慢 P99 压到 300 ms 以内；
- 把 sustained mixed workload 从 `low` 提升到至少 `high`；
- 让 sustained mixed workload 记录并通过 10000 RPS。

## 质量门禁

Focused tests:

- `node --check tools/root-slo-promotion-review-audit.mjs`
- `node --test tools/root-slo-promotion-review-audit.test.mjs tools/system-capacity-claim-audit.test.mjs`

Expected full gate:

- `npm run verify:structure`
- `npm run quality`
- `git diff --check`
