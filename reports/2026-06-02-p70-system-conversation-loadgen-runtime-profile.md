# P70 System Conversation Loadgen Runtime Profile

## Context

P68/P69 showed that current failed mixed workload evidence is not enough to
call the Conversation database pool the bottleneck. The system reports now keep
Conversation client/server gap, server timing, gateway runtime diagnostics, and
database diagnostics, but the system workload runners still executed the
Conversation load generator only from the local Windows host.

This change follows SDD 0163 and adds system-level runtime placement plumbing
for Conversation load generation.

## Change

- Added `conversationBenchmarkRuntime` and related Docker/WSL host/workspace
  options to system mixed workload defaults and CLI parsing.
- Forwarded those options to the Conversation child benchmark as
  `--benchmark-runtime` and related runtime flags.
- Carried the same options through sustained samples and sustained scale-up
  steps.
- Added top-level `conversationBenchmarkRuntimeProfile` to mixed, sustained,
  and scale-up reports.
- Preserved child `benchmarkRuntimeProfile` in the Conversation workload
  summary when the child benchmark emits it.

The default runtime remains `local`; this is an instrumentation and test
placement change, not a capacity increase.

## Verification

Focused tests:

```text
node --test tools\run-system-mixed-workload-benchmark.test.mjs tools\run-system-sustained-mixed-workload.test.mjs tools\run-system-sustained-mixed-workload-scaleup.test.mjs
```

Result:

```text
tests 28
pass 28
fail 0
```

Quality gates:

```text
npm run verify:structure
npm run quality
git diff --check
```

Result:

```text
verify:structure PASS
quality PASS
git diff --check PASS
```

## Interpretation

P70 enables the next fair comparison between local, WSL, and Docker loadgen
placement for full mixed workloads. It does not prove that WSL or Docker raises
the system limit, and it does not change database pool, gateway, or batching
configuration.
