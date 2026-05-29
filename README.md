# Intelligent Teaching Research Assistant Refactor

This folder is the executable refactor workspace for the Intelligent Teaching Research Assistant.

The target is the whole system described by the root requirements file. The original project remains a Legacy Zone while the system is rebuilt module by module. New code is built here with SDD and TDD:

1. Start from `docs/sdd`.
2. Define contracts in `contracts`.
3. Write tests before production behavior.
4. Implement one vertical slice at a time.
5. Prove every slice with contract tests, unit tests, and performance evidence before routing traffic to it.

## Language Boundaries

| Boundary | Language | Role |
| --- | --- | --- |
| Workbench UI and SDK | TypeScript | Teacher workbench, student app, generated clients |
| Hot API and event services | Go | Contract gateway, write gateway, job API, event workers |
| Local runtime and Agent Harness | Rust | Tauri shell, file/process/CLI adapters, permission enforcement |
| AI workers | Python | RAG, OCR, model calls, training workflows |

## Implemented Slices

`Conversation Write Gateway` lives under `services/conversation-write-gateway`.

It targets the measured write-path bottleneck:

- Legacy FastAPI complete POST write path: about 1011 RPS at 800 concurrency, P95 about 1034ms.
- Go same-table insert probe: about 5515 RPS at 800 concurrency, P95 about 186ms.

This does not mean a full rewrite. It means a bounded Go service should own one hot write path, with OpenAPI, tests, rollback routing, and future shadow/double-write verification.

`Teaching Archive Gateway` lives under `services/teaching-archive-gateway`.

It is the first Teaching Mode slice. It creates and cursor-lists archive metadata for student learning materials and teaching materials, reserves OCR status for AI grading, and stores only metadata. It does not upload files, read file content, install OCR/model dependencies, or route legacy traffic yet.

## Verification

Run:

```powershell
npm test
```

or directly:

```powershell
cd services/conversation-write-gateway
go test ./...
```

Run the Teaching Archive Gateway tests:

```powershell
go test ./services/teaching-archive-gateway/...
```

Run the stricter pre-merge quality gate:

```powershell
npm run quality
```

The strict gate keeps `npm test` Docker-free, then adds Go vet, Rust formatting checks, source-size and runtime TODO checks, clean architecture import checks, Identity contract audits, runtime profile audit, and both connection budget gates. It writes `reports/quality-gate.current.json`.

Check whether the current legacy + Go connection plan is safe:

```powershell
npm run budget:connections
```

The current evidence profile is expected to fail until P0b reduces legacy pool usage or moves combined load tests to a PostgreSQL/PgBouncer profile with a larger safe connection budget.

Check the conservative audited worst-case profile:

```powershell
npm run budget:connections:audited
```

Audit legacy SQLAlchemy engine sites:

```powershell
npm run audit:legacy-db-pools
```

The audit writes `reports/legacy-db-pool-audit.current.json` and intentionally returns a non-zero exit code when high-risk default pools are found.

Generate the remediation plan from the audit:

```powershell
npm run plan:legacy-db-pools
```

Run the Identity And Access gateway tests:

```powershell
go test ./services/identity-access-gateway/...
```

The Teaching Archive Gateway uses PostgreSQL metadata persistence when run as a service. The default local database secret is `ueacd`:

```powershell
$env:DATABASE_URL="postgres://app_user:ueacd@127.0.0.1:6432/intelligent_teaching_assistant?sslmode=disable"
$env:AGENT_API_KEY="ueacd"
```

Teaching Archive currently exposes:

- `POST /v1/teaching/archive-items`
- `GET /v1/teaching/archive-items?ownerType=STUDENT&studentId=student_001&pageSize=50`

The list view is sorted by `createdAt DESC, id DESC` and returns `data` plus `pageInfo`.

Run the Agent Harness permission manifest tests:

```powershell
npm run test:rust
```

The current Rust slice only evaluates dry-run permissions. It never starts processes, writes files, or drives a browser.
Harness decisions can now be converted into audit evidence records using `contracts/harness/audit-evidence.schema.json`; the current store is in-memory only and remains a dry-run/testing boundary.
`DryRunHarness` ties the permission decision and evidence append together for file, process, and browser request kinds while still returning only a report.
`JsonlEvidenceStore` can persist audit evidence locally as append-only JSONL for inspection and rollback review; it does not execute local actions.
`dry_run_file_metadata` adds a metadata-only preview for manifest-allowed file targets. It reports existence, parent existence, and target kind only after `ALLOW_DRY_RUN`, and it never reads content or creates files.
`PersistentDryRunHarness` writes dry-run evidence through `JsonlEvidenceStore`; if durable evidence append fails, the report keeps the decision visible but sets `would_execute=false`.
Persistent filesystem metadata dry-run combines both safeguards: JSONL evidence must append successfully before file metadata is probed, and metadata still never reads content or creates targets.
`ApprovalArtifact` captures `APPROVAL_REQUIRED` decisions as append-only JSONL review items. It creates only `PENDING` artifacts and does not approve, reject, execute, or grant remote local-control scope.
`ApprovalDecision` lets a local reviewer with `HARNESS_APPROVE` record `APPROVED` or `REJECTED` decisions for pending artifacts. Reviewers that still require Harness approval themselves are rejected, and decisions are durable review records with `executionReady=false`, not execution grants.
`correlate_approval_decisions` creates a review-only correlation report proving each approval decision maps to exactly one pending source artifact with matching requester, action, target, and source status. Missing, duplicated, mismatched, or execution-ready decisions stay uncorrelated and cannot be treated as execution input.
`JsonlApprovalQueueReader` loads approval artifact and approval decision JSONL streams together, emits a queue snapshot with the correlation report, and keeps `executionCandidateCount=0` for both matched and uncorrelated review records.
`ExecutionCandidateView` projects queue snapshots into a contract-tested empty execution view. It keeps `candidateCount=0` and `candidates=[]`; real local execution remains disabled until a future SDD explicitly changes that contract.

The gateway currently covers password login, WeChat session start/callback through a local bootstrap provider, principal lookup, refresh-token rotation, session revoke, remote command grants, and optional durable PostgreSQL session persistence. Remote command grants reject stale/future `issuedAt` values and replayed `(provider, externalSubjectId, nonce)` tuples; PostgreSQL runtime stores these nonces durably for multi-worker replay protection. Real WeChat OAuth provider calls remain a replaceable adapter follow-up.

Use the default in-memory session store for smoke tests and rollback. Use PostgreSQL only when testing multi-worker or restart-safe sessions:

```powershell
$env:SESSION_DATABASE_URL="postgres://app_user:ueacd@127.0.0.1:6432/intelligent_teaching_assistant?sslmode=disable"
$env:SESSION_DB_MAX_CONNS="8"
```

When `SESSION_DATABASE_URL` is set, the gateway verifies the pool, ensures the `identity_sessions` schema mirrored by `contracts/sql/identity-sessions.sql`, and keeps the default pool small so the whole-system connection budget remains valid.

Run the opt-in live PostgreSQL session lifecycle check after the PgBouncer profile is up:

```powershell
$env:IDENTITY_SESSION_INTEGRATION_DATABASE_URL="postgres://app_user:ueacd@127.0.0.1:6432/intelligent_teaching_assistant?sslmode=disable"
npm run test:identity-session:postgres
```

Without `IDENTITY_SESSION_INTEGRATION_DATABASE_URL`, that integration test skips so ordinary `npm test` remains Docker-free.

For an identity-only PgBouncer runtime that avoids the existing dev PostgreSQL `5433` port:

```powershell
npm run audit:identity-session-runtime
npm run perf:identity-session:up
npm run test:identity-session:pgbouncer
npm run bench:identity-session:pgbouncer
npm run summary:identity-session-benchmark
npm run bench:identity-http:pgbouncer
npm run perf:identity-session:down
```

That profile exposes PostgreSQL on `15432` and PgBouncer on `16432`; all local secrets are `ueacd`. Use `SESSION_DB_MAX_CONNS=16` for the PgBouncer high-concurrency profile when the global connection budget gate is passing.
If the identity-only test database needs a clean slate, use `npm run perf:identity-session:reset`; it removes only this profile's Docker volume.

The direct-limited connection budget now counts Conversation, Identity, and Teaching Archive gateways. In the direct PostgreSQL profile, the legacy backend worker count is capped at 20 so the three Go services can each reserve 8 connections while staying under the safe limit.

The benchmark writes `reports/identity-session-benchmark.current.json` with access lookup, refresh rotation, and revoke-cycle latency metrics. Override defaults by passing args through the runner, for example:

```powershell
node tools/run-identity-session-benchmark.mjs --concurrency 128 --operations 1000 --pool-max-conns 8
```

The HTTP benchmark starts the real Identity gateway against PgBouncer, waits for `/health`, writes `reports/identity-http-benchmark.current.json`, and stops the gateway process after the run.

The current HTTP evidence includes 64, 128, and 256 concurrency reports. The self-revoke fast path keeps the public API unchanged while reducing the 256-concurrency revoke-cycle P95 from `241.86ms` to `199.53ms`; see `reports/2026-05-29-p2-identity-self-revoke-fast-path.md`.

To validate passwords through the legacy FastAPI backend while keeping the new Go principal/session boundary:

```powershell
$env:LEGACY_AUTH_BASE_URL="http://127.0.0.1:12345"
```

Use the origin URL without `/api/v1`; the adapter appends `/api/v1/auth/login/password`.

For local WeChat callback tests, the bootstrap callback code defaults to `ueacd`:

```powershell
$env:WECHAT_BOOTSTRAP_CODE="ueacd"
```

Audit whether the current legacy performance Docker profile is really using PgBouncer:

```powershell
npm run audit:pgbouncer-perf:current
npm run audit:pgbouncer-perf:proposed
```

Use the refactor-owned PgBouncer override for combined high-concurrency tests:

```powershell
docker compose -f ..\智能教研助手\docker-compose.perf.yml -f infra\perf\docker-compose.pgbouncer.override.yml --profile pgbouncer up
```

Audit the Identity And Access boundary used by teacher, student, and remote command entry:

```powershell
npm run audit:identity-access
```
