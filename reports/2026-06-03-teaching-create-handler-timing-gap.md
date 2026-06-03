# Teaching Create Handler Timing Gap Evidence

## Context

This report follows SDD 0200. It uses the Teaching Archive benchmark after
adding `handler`, `pre.usecase`, `app`, and `db.insert` `Server-Timing`
metrics to successful `POST /v1/teaching/archive-items` responses.

## Environment

- PostgreSQL/PgBouncer profile: Docker `ita-identity-session-runtime`
- PgBouncer host port: `16432`
- Local secret values are masked in benchmark reports.
- Teaching benchmark runtime: local Node.js orchestrator with Go gateway
  processes
- Load shape: create archive item, create quiz submission, list archive items

## Evidence

| Report | Gateway workers | DB max conns per worker | Concurrency | createArchiveItem RPS | End-to-end P99 | Handler P99 | Pre-usecase P99 | App P99 | DB insert P99 | Client/handler gap P99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `reports/teaching-archive-benchmark.handler-timing.4gw-c384-o1536.current.json` | 4 | 32 | 384 | 828.48 | 862ms | 15.75ms | 0.65ms | 15.75ms | 15.72ms | 846.25ms |
| `reports/teaching-archive-benchmark.handler-timing.16gw-c384-o1536.current.json` | 16 | 8 | 384 | 885.81 | 776ms | 11.44ms | 0.69ms | 10.89ms | 10.89ms | 764.56ms |

Earlier SDD 0199 attribution reports showed the same shape before handler-level
timing was added:

| Report | Gateway workers | DB max conns per worker | Concurrency | createArchiveItem RPS | End-to-end P99 | App P99 | DB insert P99 | Client/app gap P99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `reports/teaching-archive-benchmark.server-timing.4gw-c96-o768.current.json` | 4 | 32 | 96 | 786.08 | 276ms | 40.04ms | 40.04ms | 235.96ms |
| `reports/teaching-archive-benchmark.server-timing.4gw-c192-o768.current.json` | 4 | 32 | 192 | 757.40 | 448ms | 18.03ms | 18.03ms | 429.97ms |
| `reports/teaching-archive-benchmark.server-timing.4gw-c384-o1536.current.json` | 4 | 32 | 384 | 853.81 | 881ms | 126.07ms | 126.07ms | 754.93ms |

## Interpretation

The Teaching write path is not currently dominated by the archive item SQL
insert. In the latest 4-gateway run, `db.insert` P99 is only `15.72ms`, while
end-to-end P99 is `862ms`. The missing tail is before handler execution or in
transport/client-side queuing.

Increasing Teaching gateway workers from 4 to 16 while keeping total configured
DB pool budget at 128 improves create P99 from `862ms` to `776ms`, but the
client/handler gap remains about `765ms`. That means "just add more Teaching
gateway workers" is not enough to prove Root SLO readiness.

## Next Step

Build a Teaching Archive Go/Docker load generator, following the existing
Conversation `cmd/httpbench` pattern, so the system can separate JavaScript
load-generator queueing from server accept/transport queueing under the same
read/write workflow shape.
