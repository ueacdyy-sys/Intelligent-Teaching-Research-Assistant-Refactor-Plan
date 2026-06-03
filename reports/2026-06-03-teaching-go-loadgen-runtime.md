# Teaching Go Load Generator Runtime Evidence

## Context

This report follows SDD 0201. SDD 0200 showed that JavaScript `fetch` load
generation produced a large client/handler gap for Teaching Archive writes.
This slice adds a Go load generator and lets the Teaching benchmark runner
execute it locally or in Docker after starting the same gateway workers.

## Workload

- Gateway workers: 4
- DB max connections per gateway: 32 and 8 comparison
- Concurrency: 384
- Operations per phase: 1536
- Phases: `createArchiveItem`, `createQuizSubmission`, `listArchiveItems`
- Transport controls for Go runs:
  - `maxConnsPerHost=128`
  - `warmConnectionsPerHost=96`
  - `clientTrace=true`

## Results

| Runtime | DB max conns/gateway | createArchiveItem RPS | End-to-end P99 | Handler P99 | App P99 | DB insert P99 | Client/server gap P99 | Transport wait P99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JavaScript fetch | 32 | 828.48 | 862ms | 15.75ms | 15.75ms | 15.72ms | n/a | n/a |
| Local Go | 32 | 3862.83 | 136.56ms | 116.61ms | 116.60ms | 116.60ms | 30.79ms | 12.84ms |
| Docker Go | 32 | 2203.84 | 337.05ms | 295.75ms | 295.75ms | 295.75ms | 42.14ms | 25.96ms |
| Docker Go | 8 | 4525.09 | 119.18ms | 82.29ms | 82.11ms | 82ms | 42.46ms | 8.32ms |

Raw reports:

- `reports/teaching-archive-benchmark.handler-timing.4gw-c384-o1536.current.json`
- `reports/teaching-archive-benchmark.go-local.4gw-c384-o1536.current.json`
- `reports/teaching-archive-benchmark.go-docker.4gw-c384-o1536.current.json`
- `reports/teaching-archive-benchmark.go-docker.4gw-db8-c384-o1536.current.json`

## Interpretation

The JavaScript load generator was the main source of the earlier
`createArchiveItem` tail-latency distortion. It reported `862ms` end-to-end P99
while the gateway handler measured only `15.75ms`.

After switching to Go load generation, the bottleneck moved to the real write
path. In Docker Go, `dbMaxConns=32` produced worse tail latency than the local
Go run: create P99 `337.05ms`, with handler and `db.insert` both at
`295.75ms`. Reducing Teaching gateway DB pool size to `8` raised create RPS to
`4525.09` and lowered create P99 to `119.18ms`, with `db.insert` P99 at `82ms`
and zero errors.

This is strong isolated-module evidence that the production10k Teaching
candidate should use Docker Go load generation and a smaller per-gateway DB
pool. It is not yet a full-system Root SLO promotion until the mixed sustained
10k runner uses this runtime and reruns the combined read/write workload.

## Superseded Follow-Up

Wire Teaching Go/Docker runtime options into the full system mixed-workload and
production10k scale-up runners, set the production10k Teaching DB pool default
to `8`, then rerun the sustained mixed read/write target with Docker/Go load
generation for both Conversation and Teaching.

That follow-up was completed in SDD 0202. The later full-system mixed-load run
promoted the current production10k default to `teachingDbMaxConns=12`, because
`12` gave better tail latency than the isolated-module `8` candidate when
Conversation, Identity, and Teaching were loaded together.
