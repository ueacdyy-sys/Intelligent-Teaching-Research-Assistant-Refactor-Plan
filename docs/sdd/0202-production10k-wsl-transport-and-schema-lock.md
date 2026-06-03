# SDD 0202: Production10k WSL Transport And Schema Lock

## Problem

The first production10k target run with Teaching Docker Go and
`teachingDbMaxConns=8` proved that the system could burst above 10k mixed
read/write RPS, but the two-sample sustained run only reached `9022.6 RPS`.
The dominant symptom was not a database insert bottleneck in Conversation:
Conversation server P99 was near `100ms`, while the client/server gap was above
`800ms`.

After adding Conversation connection warmup, the target step exceeded 13k RPS,
but Teaching workers failed during startup. The first failure mode was gateway
health timeout from per-worker `go run`; the second was a PostgreSQL schema
race:

`duplicate key value violates unique constraint "pg_type_typname_nsp_index"`

The schema race happened because the earlier session-level advisory lock was
not reliable through PgBouncer transaction pooling.

## Scope

- Tune the production10k Conversation load-generator transport:
  `maxConnsPerHost=256` and `warmConnectionsPerHost=144`.
- Use WSL Go as the production10k Conversation load-generator runtime on this
  workstation, with the Windows host reachable at `172.28.160.1`.
- Keep Docker/PgBouncer/PostgreSQL as the managed database runtime and keep
  gateway multi-worker execution.
- Build the Teaching gateway binary once in the JS runner, then start each
  worker from that binary instead of running `go run` per worker.
- Move Teaching schema initialization under a transaction-scoped advisory lock
  when the DB adapter supports transactions.
- Raise the production10k Teaching DB pool from `8` to `12` after full-system
  evidence showed lower tail latency under WSL Conversation pressure.

## Non-Goals

- Changing root product requirements or Teaching/Conversation API behavior.
- Adding model, training, vector database, Mem0, Milvus, vLLM, SFT, RL, or FP8
  dependencies.
- Claiming cloud production capacity from one Windows workstation.
- Claiming that every root workflow is production-ready; this SDD only covers
  mixed read/write performance evidence for the current refactor baseline.

## Contracts

- Production10k target pressure must still include Identity, Conversation, and
  Teaching read/write slices; it cannot be replaced by an empty endpoint test.
- A target-bearing production10k step must fail promotion when measured
  read/write RPS is below the configured target, even if child workloads exit
  successfully.
- Teaching gateway schema initialization must use `pg_advisory_xact_lock` in a
  transaction when `PoolDB` is used.
- Teaching runner reports must still mask local secrets and database URLs.
- Teaching worker startup must use a prebuilt gateway binary so multi-worker
  benchmarks do not compile the same gateway once per worker.
- WSL runtime reports must record the WSL executor, distro, host alias, and
  workspace path.

## Acceptance Criteria

- `node --test tools/run-teaching-archive-benchmark.test.mjs` proves Teaching
  workers are started from a built binary.
- `go test ./services/teaching-archive-gateway/internal/adapter/postgres`
  proves schema initialization uses a transaction advisory lock and rolls back
  on schema statement failure.
- `node --test tools/run-system-sustained-mixed-workload-scaleup.test.mjs`
  proves the production10k defaults use WSL Conversation load generation,
  `maxConnsPerHost=256`, `warmConnectionsPerHost=144`, and
  `teachingDbMaxConns=12`.
- A two-sample production10k target run with default profile settings reaches
  at least 10k mixed read/write RPS with zero errors.
- A 25k target probe is allowed to fail the target when it misses measured
  throughput; the miss must be reported as target shortfall, not hidden.
- `npm run quality` passes before commit.

## Rollback

Revert the production10k runtime defaults to Docker Conversation load
generation and `teachingDbMaxConns=8`, revert Teaching worker startup to
per-worker `go run`, and revert schema initialization to the previous
session-lock path. This keeps functionality intact, but reintroduces weaker
10k evidence, slower worker startup, and PgBouncer transaction-pooling schema
race risk.
