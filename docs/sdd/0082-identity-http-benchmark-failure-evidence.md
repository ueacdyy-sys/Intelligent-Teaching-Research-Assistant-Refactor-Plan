# SDD 0082: Identity HTTP Benchmark Failure Evidence

## Problem

The live Identity HTTP benchmark now proves that the PgBouncer-routed path can
complete a high-concurrency client-facing workload with zero errors, but
stronger probes can fail before writing a machine-readable report.

That leaves the most important performance signal trapped in terminal output:
the system limit may be a real runtime stability ceiling, a benchmark runner
blind spot, or a configuration/resource issue, but the refactor evidence
registry cannot reason about it.

## Source Requirement References

- Root requirement: the assistant must remain efficient and stable as teaching,
  research, student app, and remote command flows expand.
- SDD 0012: Identity HTTP benchmarks are the client-facing performance evidence
  for login, principal lookup, refresh rotation, and revoke cycles.
- SDD 0080: performance claims need source commands, source reports, runtime
  profile, metrics, database evidence, and next action.
- SDD 0081: the current performance profile routes through PgBouncer and is
  ready for live Docker-backed limit evidence.

## Scope

In scope:

- Make `tools/run-identity-http-benchmark.mjs` write a JSON failure report to
  `--out` when the gateway exits early or the Go benchmark exits non-zero.
- Keep failure-report construction testable without starting Go, Docker, or the
  gateway process.
- Register both the current passing evidence and the nearest current limit
  probe in the performance evidence registry.
- Preserve Docker-free `npm test`; Docker remains a manual/live evidence
  requirement for the benchmark command only.

Out of scope:

- Changing root requirements or legacy application source.
- Claiming a production concurrency ceiling from one failed local probe.
- Adding model, OCR, RAG, embedding, vector database, or training dependencies.
- Fixing the gateway crash before the failure is captured as durable evidence.

## Contracts

- Runner: `tools/run-identity-http-benchmark.mjs`
- Focused test: `tools/run-identity-http-benchmark.test.mjs`
- Passing report: `reports/identity-http-benchmark.current.json`
- Limit probe report: `reports/identity-http-benchmark.concurrency360.json`
- Registry: `contracts/ops/performance-evidence-registry.current.json`

Failure reports include:

- `generatedAt`
- `benchmarkKind`
- `workloadType`
- `status`
- `baseUrl`
- `concurrency`
- `operationsPerPhase`
- `sessionDbMaxConns`
- `dockerRequiredForEvidence`
- `exitCode`
- `gatewayExitCode`
- `gatewaySignal`
- `phase` when inferable
- `errorMessage`
- `gatewayOutputTail`
- `benchmarkOutputTail`

## Acceptance Criteria

- `node --test tools/run-identity-http-benchmark.test.mjs` fails before the
  runner exports a testable failure-report builder.
- The failure-report builder masks local secret values and does not include the
  session DSN.
- A non-zero Go benchmark exit writes a `FAILED` JSON report to `--out`.
- The performance evidence registry accepts `HTTP_BENCHMARK` entries and fails
  when a benchmark report status does not match the registry entry status.
- The current registry includes the 320-concurrency passing HTTP benchmark and
  the 360-concurrency limit probe.
- `npm test` remains Docker-free and passes.
- `npm run quality` passes.
- Rust build output `services/agent-harness/target` is removed after Cargo
  tests and verified absent.

## Rollback

Remove SDD 0082, the runner failure-report helpers, the focused runner test,
the HTTP benchmark registry entries, and the generated limit-probe report. The
existing passing HTTP benchmark runner remains available from SDD 0012.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- 320-concurrency PgBouncer-routed benchmark result.
- 360-concurrency strong probe result, pass or fail, as JSON.
- performance evidence registry audit result.
- `npm test` and `npm run quality` results.
- confirmation that no Docker-dependent command was added to `npm test`.
