# Production10k Current Limit Report

## Plain-Language Result

This refactor baseline now supports more than 10k mixed read/write requests per
second on the current workstation test setup.

The strongest sustained 10k evidence in this round is:

- `23572.47` mixed read/write RPS
- `0` errors
- max P99 latency `256.95ms`
- P99 drift `6.51ms`
- 2 target samples

After the same settings were promoted into the `production10k` default profile,
the default-profile rerun also passed:

- `22836.8` mixed read/write RPS
- `0` errors
- max P99 latency `310.78ms`
- P99 drift `119.65ms`

In simple terms: under the tested workload, the system handled about 2.35 times
the requested 10k RPS target. Compared with ordinary small web systems, this is
already a high-throughput backend result. It should not yet be described as a
cloud production SLA, because the evidence is from a local Windows/WSL/Docker
workstation and only covers the current mixed workload slices.

## What Changed

- Conversation load generation now uses WSL Go for production10k evidence.
- Conversation HTTP transport is prewarmed:
  - `maxConnsPerHost=256`
  - `warmConnectionsPerHost=144`
- Teaching gateway workers are started from one prebuilt binary instead of
  `go run` per worker.
- Teaching schema startup now uses a transaction-scoped advisory lock, which is
  reliable with PgBouncer transaction pooling.
- Teaching production10k DB pool is now `12` connections per gateway after
  mixed-load evidence showed it reduced tail latency versus `8`.

## Before And After

| Evidence | Status | Mixed read/write RPS | Max P99 | Errors | Meaning |
| --- | --- | ---: | ---: | ---: | --- |
| Docker Go + Teaching db8 + old Identity ingress | Failed | n/a | n/a | socket pressure | Too many prewarmed Identity ingress connections exhausted local sockets. |
| Docker Go + Teaching db8 + ingress8, one sample | Passed | `10660.57` | `863.65ms` | `0` | Could burst above 10k, but latency was poor. |
| Docker Go + Teaching db8 + ingress8, two samples | Failed target | `9022.6` | `885.26ms` | `0` | Stable, but short of 10k sustained target. |
| Conversation warmup + Teaching binary + schema tx lock | Passed | `16067.47` | `332.44ms` | `0` | Main connection/startup bottlenecks fixed. |
| WSL Conversation + Teaching db12, two samples | Passed | `23572.47` | `256.95ms` | `0` | Best sustained 10k evidence in this round. |
| 25k pressure probe | Target not met | `24283.64` | `496.84ms` | `0` | Approximate current local ceiling is around the 24k RPS band. |

## Module Split For Best Sustained Run

Raw report:
`reports/system-sustained-mixed-workload-scaleup.production10k-conv-wsl-teaching-db12-sustained.current.json`

Default-profile verification report:
`reports/system-sustained-mixed-workload-scaleup.production10k-default-final-sustained.current.json`

Sample 1:

- Identity: `1875.99 RPS`, P99 `170.28ms`, errors `0`
- Conversation: `18569.6 RPS`, P99 `250.44ms`, errors `0`
- Teaching: `3126.88 RPS`, P99 `190.31ms`, errors `0`

Sample 2:

- Identity: `2158.83 RPS`, P99 `141.03ms`, errors `0`
- Conversation: `19087.2 RPS`, P99 `256.95ms`, errors `0`
- Teaching: `4090.87 RPS`, P99 `108.27ms`, errors `0`

## Current Limit

The current measured local limit is not 10k. The system crossed 10k with margin.
The current observed edge is closer to `24k RPS` for this mixed workload on this
machine.

The 25k target probe reached `24283.64 RPS` with zero errors, but missed the
25k target by `716.36 RPS`. Latency also rose to P99 `496.84ms`. The bottleneck
at that pressure was:

- Conversation: `20283.8 RPS`, P99 `496.84ms`
  - server P99 `147.24ms`
  - client/server gap P99 `407.27ms`
- Teaching: `1998.95 RPS`, P99 `369.77ms`
  - `createArchiveItem` DB insert P99 `312.36ms`
- Identity: `2000.89 RPS`, P99 `199.33ms`

That means the system degrades by queueing and tail latency before it fails by
errors.

## Completed Architecture Modules

- Identity and Access: multi-worker gateway, ingress fanout, PgBouncer-backed
  sessions, write concurrency guard, local secret masking.
- Conversation Write: Go gateway, batched writes, multi-worker fanout,
  Docker/WSL Go load generation, client/server timing attribution.
- Teaching Archive and Quiz: Go gateway, Go load generator, multi-worker
  startup, transaction-safe schema initialization, archive/quiz/list workload.
- Knowledge Retrieval: policy and benchmark audit slice remains ready without
  heavy vector/model dependencies.
- AI Worker Admission: job admission policy and runtime dependency gate remain
  ready without installing training/model dependencies.
- Quality gates: SDD structure, tool tests, Go tests, Rust harness tests,
  contract audits, performance evidence audits.

## Progress Estimate

For the whole-system refactor, this round moves the performance and runtime
foundation from roughly `4/10` to `6/10`.

The reason it is not higher: the root product workflow is broader than raw
performance. The refactor still needs more end-to-end product workflow coverage,
more cross-module diagnostics under longer runs, packaging/deployment evidence,
and stricter user-facing acceptance tests.

## Comparison For Non-Experts

- A simple personal project may only need tens of RPS.
- A normal internal tool often lives comfortably under hundreds of RPS.
- A busy school or small SaaS backend may need thousands of RPS at peak.
- This local refactor evidence reaches the `10k+ RPS` class and probes around
  `24k RPS`, which is already a serious backend throughput tier.

The important caveat: this is local benchmark evidence, not a cloud SLA. A real
production claim would need longer duration, multiple machines, observability,
failure recovery, deployment topology, and real user workflow tests.
