# SDD 0195: System Identity Loadgen Runtime Profile

## Problem

The system mixed workload runners can drive the Conversation write benchmark from
Docker or WSL, but the Identity HTTP benchmark is still implicitly driven by the
local Go runtime at the system orchestration layer.

That weakens production 10k evidence because Identity is one of the root
read/write workflows. If its load generator remains local while the rest of the
system is scaled through Docker or WSL, a failed run may measure the client
runtime ceiling instead of the service ceiling.

## Scope

- Add a system-level Identity benchmark runtime profile with `local` and
  `docker` executors.
- Keep the default mixed and sustained runners on `local` for fast development
  evidence.
- Make the `production10k` sustained scale-up profile default Identity loadgen
  to Docker.
- Propagate the profile through mixed, sustained, and scale-up reports so Root
  SLO evidence can identify the runtime that generated Identity pressure.

## Non-Goals

- Running the full production 10k benchmark in this slice.
- Adding WSL support to the Identity HTTP benchmark. The underlying benchmark
  currently supports local and Docker, so the system profile mirrors that
  contract.
- Adding model, OCR, RAG, vector, embedding, training, Mem0, Milvus, vLLM, SFT,
  RL, or FP8 dependencies to the baseline.

## Contract

System mixed workload options:

```text
--identity-benchmark-runtime local|docker
--identity-benchmark-docker-image golang:1.26-alpine
--identity-benchmark-docker-host host.docker.internal
```

Report profile:

```json
{
  "identityBenchmarkRuntimeProfile": {
    "runtime": "docker",
    "executor": "DOCKER_GO",
    "dockerImage": "golang:1.26-alpine",
    "dockerHostAlias": "host.docker.internal"
  }
}
```

## Acceptance Criteria

- Mixed workload commands pass Identity benchmark runtime arguments to
  `run-identity-http-benchmark.mjs`.
- Sustained workload samples preserve the Identity runtime profile.
- Production 10k scale-up steps default Identity runtime to Docker.
- Invalid Identity runtime values fail validation before workload execution.
- Existing standard scale-up behavior remains local and fast by default.

## Rollback

Remove the Identity runtime helper, remove the propagated options from the three
system runners, and return the production 10k profile to relying only on
Conversation runtime selection. Root SLO can still block 10k claims, but it will
again lack system-level Identity loadgen runtime evidence.
