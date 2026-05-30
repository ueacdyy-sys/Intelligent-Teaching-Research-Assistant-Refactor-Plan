# SDD 0079: AI Worker Runtime Dependency Profile

## Problem

P7 has worker job contracts, admission policy, and retrieval benchmark evidence.
The remaining worker isolation gap is dependency drift: the root runtime can
still accidentally grow model, OCR, RAG, embedding, vector database, or training
packages if a later slice adds them to baseline manifests.

Without an executable dependency profile gate, the project could satisfy worker
job contracts while still shipping heavy AI packages in the desktop/runtime
baseline, which violates the small package and worker-isolation invariants.

## Source Requirement References

- Root requirement: RAG, OCR, model calls, and fine-tuning are AI capabilities
  that may exist behind worker boundaries.
- Root requirement: private fine-tuning and local GGUF export must not make the
  whole application unstable or oversized.
- Whole-system invariant: training/model dependencies are optional worker
  dependencies, not baseline runtime dependencies.
- Whole-system invariant: Python workers do not become the platform bus.
- SDD 0075: AI worker jobs require `baselineRuntimeDependencyAllowed=false`.
- SDD 0077: admission blocks jobs that try to allow baseline dependencies.

## Scope

In scope:

- Add an AI worker runtime dependency profile contract.
- Declare baseline manifests that are allowed to participate in the normal
  desktop/runtime build.
- Declare optional worker dependency bundles for RAG, OCR, and fine-tuning
  without installing them.
- Audit baseline Node, Go, and Rust manifests for forbidden AI worker packages.
- Audit that optional worker bundles stay `PYTHON_WORKER` owned and
  `OPTIONAL_WORKER_ENV` install-mode only.
- Audit that optional worker package names are not present in baseline
  manifests.
- Add an executable audit and include it in strict quality.

Out of scope:

- Installing Python, model, OCR, RAG, embedding, vector database, or training
  dependencies.
- Creating a Python worker virtual environment.
- Implementing worker execution, sandboxing, queues, or scheduling.
- Generating lockfiles for optional worker bundles.
- Changing package-lock, Go module, Cargo, or SQL contracts.

## Contracts

Schema:

- `contracts/ai-worker/ai-worker-runtime-dependency-profile.schema.json`

Current profile:

- `contracts/ai-worker/ai-worker-runtime-dependency-profile.current.json`

Tooling:

- `tools/ai-worker-runtime-dependency-profile-audit.mjs`
- `tools/ai-worker-runtime-dependency-profile-audit.test.mjs`
- `reports/ai-worker-runtime-dependency-profile.current.json`

## Acceptance Criteria

- `node --test tools/ai-worker-runtime-dependency-profile-audit.test.mjs` fails
  before the audit tool exists.
- Current baseline manifests are present and readable.
- Current baseline manifests contain no forbidden AI worker packages.
- Optional worker bundles cover `RAG_RETRIEVAL`, `OCR_RECOGNITION`, and
  `FINE_TUNING`.
- Optional worker bundles are owned by `PYTHON_WORKER`.
- Optional worker bundles use `OPTIONAL_WORKER_ENV`.
- Optional worker bundles declare `baselineRuntimeDependencyAllowed=false`.
- Optional worker package names do not appear in baseline manifests.
- `npm run audit:ai-worker-runtime-dependencies` passes and writes
  `reports/ai-worker-runtime-dependency-profile.current.json`.
- `npm test` passes.
- `npm run quality` passes.
- No package dependency, lockfile, SQL table, OCR/RAG/model, embedding, vector
  database, or training dependency is added.

## Rollback

Remove the runtime dependency profile contract, current profile, audit tool,
focused tests, current report, package audit script, quality-gate entry,
structure verifier entries, and this SDD. Earlier P7 worker contracts,
admission, and retrieval benchmark gates remain unchanged.

## Observability And Performance Evidence

Record:

- red focused test output before implementation.
- focused runtime dependency profile audit test result after implementation.
- `npm run audit:ai-worker-runtime-dependencies` result.
- `npm test` result.
- `npm run quality` result.
- dependency and SQL drift check.
- confirmation that optional AI worker packages were declared only as profile
  metadata and not installed.
