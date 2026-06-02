# P71 System Loadgen Runtime Matrix

## Context

P70 made the Conversation load generator runtime configurable at the system
runner level. P71 uses that capability to test whether moving the Conversation
load generator from Windows-local Go to WSL or Docker improves the mixed
read/write workload.

This is a runtime placement probe. It does not change service configuration and
does not promote a full-system capacity claim.

## Commands

All runs used `npm run bench:system-sustained-mixed-workload:scaleup` with
`manageDocker=true`, `dockerCleanup=reset`, one sample per step, and the same
database/transport/gateway settings for matching steps.

Runtime-specific options:

```text
--conversation-benchmark-runtime local
--conversation-benchmark-runtime wsl --conversation-benchmark-wsl-host 172.28.160.1 --conversation-benchmark-wsl-workspace /mnt/c/Users/Administrator/Desktop/Intelligent-Teaching-Research-Assistant-Refactor-Plan
--conversation-benchmark-runtime docker --conversation-benchmark-docker-host host.docker.internal
```

## Results

| Step | Runtime | Status | Errors | System P99 ms | Identity P99 ms | Conversation P99 ms | Teaching P99 ms | Conv server P99 ms | Conv gap P99 ms | Conv db acquire P99 ms | Conv batch wait P99 ms | Conv insert P99 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| smoke | local | PASSED | 0 | 26 | 15.83 | 22.03 | 26 | 20.85 | 2.4 | 0 | 11.91 | 11.91 |
| smoke | wsl | PASSED | 0 | 31 | 13.08 | 26.6 | 31 | 24.99 | 3.15 | 3.55 | 16.08 | 11.37 |
| smoke | docker | PASSED | 0 | 26 | 19.57 | 21.68 | 26 | 18.3 | 8.39 | 1.69 | 11.36 | 10.8 |
| mixed800 | local | PASSED | 0 | 450.54 | 450.54 | 114.69 | 164 | 67.75 | 75.36 | 0 | 41.17 | 48.08 |
| mixed800 | wsl | PASSED | 0 | 415.15 | 415.15 | 257.78 | 191 | 224.57 | 143.23 | 31.07 | 134.83 | 102.23 |
| mixed800 | docker | PASSED | 0 | 406.16 | 406.16 | 262.76 | 167 | 157.3 | 242.47 | 0 | 117.56 | 47 |
| mixed1600 | local | PASSED | 0 | 646.11 | 646.11 | 215.78 | 476 | 72.42 | 193.02 | 0.62 | 38.62 | 43.77 |
| mixed1600 | wsl | PASSED | 0 | 677.83 | 677.83 | 385.69 | 307 | 72.19 | 355.37 | 0 | 35.69 | 47.96 |
| mixed1600 | docker | PASSED | 0 | 724.26 | 724.26 | 337.36 | 295 | 34.68 | 326.55 | 0 | 19.11 | 23.2 |

## Evidence Files

- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-local-smoke.json`
- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-wsl-smoke.json`
- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-docker-smoke.json`
- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-local-mixed800.json`
- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-wsl-mixed800.json`
- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-docker-mixed800.json`
- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-local-mixed1600.json`
- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-wsl-mixed1600.json`
- `reports/system-sustained-mixed-workload-scaleup.p71-loadgen-runtime-docker-mixed1600.json`

Each top-level file has its per-step and child workload reports under the same
prefix.

## Verification

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
P71 generated report secret scan PASS
Docker residual container check PASS
```

## Interpretation

- All 9 matrix cells passed with zero errors, so `local`, `wsl`, and `docker`
  Conversation loadgen runtime placement are all viable at smoke, `mixed800`,
  and `mixed1600`.
- System P99 is dominated by Identity P99 in every mixed step. Moving only
  Conversation loadgen does not remove the system-level bottleneck.
- Docker has the best system P99 at `mixed800` but the worst at `mixed1600`.
  WSL is similar: slightly better than local at `mixed800`, worse at
  `mixed1600`.
- Conversation's client/server gap grows when loadgen moves to WSL or Docker at
  `mixed1600`. That means runtime placement can change measurement overhead and
  should not be treated as a pure service-capacity improvement.
- Local runtime remains the safest default for current evidence. Docker/WSL are
  useful probes for isolating loadgen and socket behavior, not default
  production-capacity evidence.

## Next Action

Do not tune Conversation DB pool from this matrix alone. The next optimization
target should be the mixed workload Identity path, because it owns max P99 at
`mixed800` and `mixed1600` across all runtime placements.
