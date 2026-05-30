# SDD 0083: Identity Runtime Performance Profile

## Problem

SDD 0082 captured the current Identity HTTP gateway limit with durable evidence:
320 concurrent clients pass, while a 360-concurrency probe fails in the login
write phase. The evidence also shows a configuration mismatch: the
identity-only Docker runtime still uses a smaller PostgreSQL/PgBouncer profile
than the current whole-system PgBouncer performance profile.

Before treating the 320-360 range as a system limit, the identity-only runtime
profile must be aligned with the current high-concurrency database profile and
then retested under the same HTTP benchmark contract.

## Source Requirement References

- Root requirement: the assistant must remain efficient and stable as teaching,
  research, student app, and remote command flows expand.
- SDD 0010: Identity session runtime owns the Docker-backed PgBouncer profile.
- SDD 0012: Identity HTTP benchmarks are the client-facing performance evidence.
- SDD 0081: the current whole-system performance profile uses PostgreSQL
  `max_connections=300`, `shared_buffers=1GB`, and PgBouncer transaction
  pooling.
- SDD 0082: the current single-gateway pass and limit probes must remain
  machine-readable performance evidence.

## Scope

In scope:

- Tighten the identity session runtime audit so it checks PostgreSQL
  `max_connections`, `shared_buffers`, and PgBouncer server-connection capacity.
- Align `infra/perf/docker-compose.identity-session.yml` and
  `infra/perf/identity-session-pgbouncer.ini` to the current performance
  profile values.
- Preserve local test secrets as `ueacd`.
- Keep Docker out of `npm test`; live Docker benchmarks remain explicit
  performance evidence commands.
- Rerun the current passing and higher-concurrency HTTP probes after the profile
  change and update the performance evidence registry.

Out of scope:

- Changing root requirements or legacy application source.
- Adding model, OCR, RAG, embedding, vector database, or training dependencies.
- Claiming ultra-high concurrency unless live evidence proves it.
- Introducing a multi-worker gateway profile before the single-gateway tuned
  profile has been measured.

## Contracts

- Runtime profile:
  - `infra/perf/docker-compose.identity-session.yml`
  - `infra/perf/identity-session-pgbouncer.ini`
  - `infra/perf/identity-session-userlist.txt`
- Audit:
  - `tools/identity-session-runtime-profile-audit.mjs`
  - `tools/identity-session-runtime-profile-audit.test.mjs`
  - `reports/identity-session-runtime-profile.current.json`
- Evidence:
  - `reports/identity-http-benchmark.current.json`
  - `reports/identity-http-benchmark.concurrency360.json`
  - optional higher limit probe report when a 360-concurrency probe passes.
  - `contracts/ops/performance-evidence-registry.current.json`

## Acceptance Criteria

- `node --test tools/identity-session-runtime-profile-audit.test.mjs` fails
  before implementation when PostgreSQL or PgBouncer capacity is below the
  tuned profile.
- The identity runtime audit requires PostgreSQL `max_connections>=300`.
- The identity runtime audit requires PostgreSQL `shared_buffers>=1GB`.
- The identity runtime audit requires PgBouncer `max_db_connections=90`.
- `npm run audit:identity-session-runtime` reports `READY`.
- Live Docker-backed Identity HTTP benchmark evidence is refreshed after the
  profile change.
- The performance evidence registry records the tuned identity runtime values.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Restore the identity runtime compose and PgBouncer settings to the previous
smaller profile, remove the tightened audit checks, restore the previous
Identity HTTP benchmark evidence, and rerun `npm run audit:identity-session-runtime`
plus `npm run audit:performance-evidence`.

## Observability And Performance Evidence

Record:

- red focused audit test output before implementation.
- identity session runtime audit output after implementation.
- live Identity HTTP benchmark results after the tuned profile starts.
- performance evidence registry audit result.
- `npm test` and `npm run quality` results.
- Docker shutdown and Rust target cleanup.
