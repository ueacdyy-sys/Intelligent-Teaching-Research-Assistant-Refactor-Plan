# P7 AI Worker Job Admission Evidence

## Scope

- SDD: `docs/sdd/0077-ai-worker-job-admission.md`
- Boundary: dispatch-time admission between AI worker job contracts and the
  knowledge access policy.
- Root-requirement link: cloud nodes can use only public knowledge, local nodes
  can use local private/student stores, and remote-device nodes cannot use this
  machine's local knowledge.

## Red Test

Command:

```powershell
node --test tools\ai-worker-job-admission.test.mjs
```

Expected failure before implementation:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\tools\ai-worker-job-admission.mjs'
tests 1
fail 1
```

This proved there was no admission boundary connecting SDD 0075 worker jobs to
SDD 0076 knowledge policy.

## Focused Test

Command:

```powershell
node --test tools\ai-worker-job-admission.test.mjs
```

Result:

- 8 tests passed.
- Current valid worker job examples are allowed.
- Cloud private knowledge is blocked.
- Cloud student archive data is blocked.
- Remote-device access to this machine's local public knowledge is blocked.
- Baseline runtime dependency attempts are blocked.
- Direct main database write attempts are blocked.
- Admission decisions preserve job identity and source policy version.

## Audit

Command:

```powershell
npm run audit:ai-worker-job-admission
```

Result:

- `AI Worker job admission: READY`
- Dispatch decision: `ALLOW_DISPATCH`
- Report written to `reports/ai-worker-job-admission.current.json`
- All current jobs preserve `jobId`, `nodeType`, `capabilityKind`, reasons, and
  `sourcePolicyVersion=2026-05-30.knowledge.access-policy.v1`.

## Full Gates

Command:

```powershell
npm test
```

Result:

- structure verified.
- Node tool tests: 83 passed across 17 suites.
- Go tests passed for conversation, identity, and teaching archive gateways.
- Rust Agent Harness tests passed.

Command:

```powershell
npm run quality
```

Result:

- `reports/quality-gate.current.json` has `allPassed=true`.
- `AI worker job admission audit`: pass.
- direct-limited connection budget: pass.
- PgBouncer connection budget: pass.

## Drift Checks

- `git diff --check`: no whitespace errors.
- Dependency and SQL drift check: no output for package lock, Go modules, Cargo
  files, or SQL contracts.
- `services/agent-harness/target` cleanup result: `False`.
- No Python model, OCR, RAG, training, or baseline runtime dependency was added.

## Review Notes

- Clean Architecture score: 9/10. The admission policy is pure, contract-first,
  and independent of queue/runtime details. The remaining point belongs to a
  later queue/scheduler slice where this pure boundary should be injected before
  dispatch.
- API/interface score: 9/10. The result contract preserves stable fields and
  reasons. A later persisted admission log may add correlation IDs without
  changing current fields.
- Refactoring safety score: 10/10. The slice adds one behavior boundary without
  changing existing runtime behavior.
