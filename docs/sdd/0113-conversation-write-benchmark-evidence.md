# SDD 0113: Conversation Write Benchmark Evidence

## Problem

SDD 0001 identifies the Research conversation creation path as the first Go
hot-path migration candidate and gives it a concrete target: 800-way write
concurrency above 2000 RPS, P95 below 500ms, and zero failures under the chosen
connection budget.

The gateway currently has contract and unit coverage, but it does not own its
minimum PostgreSQL schema bootstrap and it has no current benchmark report in
the performance evidence registry. That makes the Research subsystem weaker
than Identity in the whole-system refactor evidence chain.

## Source Requirement References

- Root requirement: Research mode needs multi-model conversations and knowledge
  workflows.
- Root requirement: packaging and runtime must stay compact, stable, and
  efficient.
- SDD 0001: conversation creation is the first Research hot-path migration
  candidate.
- SDD 0002 and SDD 0005: database-using performance work must keep explicit
  connection budgets and route high-concurrency tests through PgBouncer.

## Scope

In scope:

- Add a refactor-owned `research_conversations` schema bootstrap for the Go
  conversation write gateway.
- Keep repository code behind a small database executor port.
- Add a deterministic HTTP benchmark command for
  `POST /v1/research/conversations`.
- Register a current 800-concurrency benchmark report in the performance
  evidence registry.
- Use local performance secrets set to `ueacd`.

Out of scope:

- Migrating messages, bookmarks, nodes, knowledge retrieval, or multi-model
  fusion.
- Replacing the full legacy Research API.
- Adding model, training, OCR, RAG, vector, embedding, or queue dependencies.
- Changing public Identity or Teaching Archive contracts.

## Contracts Touched

- `contracts/sql/research-conversations.sql` records the minimum table/index
  shape required by the Go gateway.
- `services/conversation-write-gateway/cmd/httpbench` emits a machine-readable
  HTTP benchmark report with latency, RPS, errors, and transport profile.
- `contracts/ops/performance-evidence-registry.current.json` includes the
  current Research conversation write benchmark evidence.

## Acceptance Criteria

- Focused PostgreSQL adapter tests fail before implementation because
  `EnsureSchema` and the database executor port are missing.
- Focused benchmark command tests fail before implementation because the
  benchmark report helpers do not exist.
- `go test ./services/conversation-write-gateway/...` passes.
- A live PgBouncer-backed benchmark reaches 800 concurrency with zero errors.
- `npm run audit:performance-evidence` passes.
- `npm run quality` passes.

## Rollback Plan

Remove the schema bootstrap, benchmark command, benchmark report, and registry
entry. Route conversation creation back to the legacy FastAPI endpoint from SDD
0001.

## Observability And Performance Evidence

Record:

- Red/green focused Go tests.
- Live benchmark command, report path, RPS, P95, and error count.
- Database cleanup command for benchmark-created conversation rows.
- Green performance evidence registry audit.
- Green strict quality gate output.

Current evidence update:

- One local gateway failed at 800 concurrency with transport-level connection
  refusals, while successful requests still stayed below the latency target.
- Four local gateways passed 1400 concurrency and failed at 1500 concurrency.
- Six local gateways passed 2200 concurrency and failed at 2300 concurrency.
- The failure mode stayed at the HTTP ingress accept/connect layer rather than
  PostgreSQL queueing, so the next optimization must focus on gateway fan-out,
  ingress/listener diagnostics, or socket backlog tuning before database pool
  increases.

SDD 0114 follow-up:

- The runner-managed profile made startup and cleanup reproducible and adjusted
  the current claim to 2100 concurrency as the strongest automated pass point.
- The runner-managed 2200 probe failed with connection refusals while all
  gateway processes remained alive, which strengthens the conclusion that the
  next bottleneck is ingress accept/connect pressure rather than PostgreSQL.
