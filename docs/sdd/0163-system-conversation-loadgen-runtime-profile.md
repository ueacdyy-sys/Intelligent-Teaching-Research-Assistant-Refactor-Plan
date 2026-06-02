# SDD 0163: System Conversation Loadgen Runtime Profile

## Problem

P69 made Conversation runtime and database diagnostics visible in system mixed,
sustained, and scale-up reports. That closed the observability gap after P68:
failed mixed runs can now show whether client/server gap, gateway runtime
diagnostics, and database acquire timing point away from the database pool.

The remaining gap is workload placement. The Conversation child benchmark
already supports `--benchmark-runtime local|docker|wsl`, but the system
orchestrators did not expose or forward that setting. Full mixed tests were
therefore tied to the Windows-local load generator even when the next
investigation needs WSL or Docker to isolate client socket and load generator
pressure from gateway/database behavior.

## Scope

In scope:

- Add system-level Conversation loadgen runtime options to mixed workload,
  sustained mixed workload, and sustained scale-up runners.
- Forward those options to the Conversation child benchmark command.
- Include a top-level `conversationBenchmarkRuntimeProfile` in system reports.
- Preserve the child `benchmarkRuntimeProfile` inside the Conversation workload
  summary when present.
- Keep `local` as the default runtime so existing scripts keep their behavior.

Out of scope:

- Changing gateway workers, database pool sizes, batching defaults, or
  concurrency guardrails.
- Enabling Docker or WSL by default.
- Introducing model, OCR, RAG, vector, embedding, training, or other heavy
  runtime dependencies.
- Claiming a new full-system capacity limit.

## Contracts

System runners accept these options:

```text
--conversation-benchmark-runtime local|docker|wsl
--conversation-benchmark-docker-image <image>
--conversation-benchmark-docker-host <host-alias>
--conversation-benchmark-wsl-distro <distro>
--conversation-benchmark-wsl-host <host-alias>
--conversation-benchmark-wsl-workspace <path>
```

System mixed workload forwards them to `run-conversation-write-benchmark.mjs`
as the child benchmark runtime options:

```text
--benchmark-runtime wsl
--benchmark-wsl-host 172.28.160.1
--benchmark-wsl-workspace /mnt/c/workspace
```

System reports include a bounded runtime profile:

```json
{
  "conversationBenchmarkRuntimeProfile": {
    "runtime": "wsl",
    "executor": "WSL_GO",
    "dockerImage": null,
    "dockerHostAlias": null,
    "wslDistro": "Ubuntu",
    "wslHostAlias": "172.28.160.1",
    "wslWorkspace": "/mnt/c/workspace"
  }
}
```

Older reports without the profile remain parseable.

## Acceptance Criteria

- Mixed workload tests prove CLI parsing, Conversation child command
  forwarding, top-level runtime profile reporting, child profile preservation,
  and invalid runtime rejection.
- Sustained mixed workload tests prove runtime options flow into every sample
  and the sustained report includes the top-level profile.
- Scale-up tests prove runtime options flow into every sustained step and the
  scale-up report includes the top-level profile.
- `local` remains the default.
- Focused Node tests, `npm run verify:structure`, `npm run quality`, and
  `git diff --check` pass.

## Rollback

Remove the system-level Conversation benchmark runtime options and profile
fields from the mixed, sustained, and scale-up runners. The child Conversation
benchmark runtime support remains unchanged.
