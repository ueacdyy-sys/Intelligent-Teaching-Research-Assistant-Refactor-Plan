# P56 System Mixed Workload Identity Ingress Profile

## Summary

This slice prepares the next mixed workload proof by making the system runner
stack able to express the P55 Identity tuning candidate. The mixed, sustained,
and sustained scale-up runners now pass Identity ingress and Identity-specific
HTTP client transport settings down to `run-identity-http-benchmark.mjs`.

Decision: keep this as runner infrastructure only. It does not promote a
full-system ultra-concurrency claim.

## Code Changes

- Added Identity-specific transport options to the mixed workload runner:
  `identityMaxConnsPerHost` and `identityWarmConnectionsPerHost`.
- Added Identity ingress options to mixed, sustained, and sustained scale-up
  runners.
- Preserved backward compatibility: Identity transport settings inherit the
  shared `maxConnsPerHost` and `warmConnectionsPerHost` values when omitted.
- Added mixed workload port overlap validation for Identity ingress ports.
- Added `transportProfile` and `identityIngressProfile` metadata to mixed,
  sustained, and scale-up rollup reports.
- Added focused tests for parsing, command generation, sustained sample
  propagation, scale-up step propagation, port overlap rejection, and rollup
  metadata.
- Added `docs/sdd/0156-system-mixed-workload-identity-ingress-profile.md`.

## Evidence

Focused tests:

```powershell
node --test tools/run-system-mixed-workload-benchmark.test.mjs tools/run-system-sustained-mixed-workload.test.mjs tools/run-system-sustained-mixed-workload-scaleup.test.mjs
```

Result: PASS, 26 tests.

Structure and quality:

```powershell
npm run verify:structure
npm run quality
```

Result: PASS. The strict quality gate wrote
`reports/quality-gate.current.json` with `allPassed=true`.

## Candidate Command Shape

The next live mixed scale-up can now express the P55 candidate without applying
Identity client fanout to conversation writes:

```powershell
npm run bench:system-sustained-mixed-workload:scaleup -- --identity-gateway-count 12 --identity-session-db-max-conns 10 --identity-ingress-proxy true --identity-ingress-count 16 --identity-max-conns-per-host 150 --identity-warm-connections-per-host 150 --identity-ingress-max-conns-per-host 40 --identity-ingress-warm-connections-per-host 16
```

That command still needs full step, sample, timeout, PgBouncer, conversation,
and teaching settings before it becomes promotion-quality evidence.

## Interpretation

The bottleneck work remains evidence-driven. This change removes a runner
limitation so the next whole-system test can evaluate the actual Identity
candidate selected by the 4400-concurrency phase matrix.

It does not prove that the system supports ultra-high concurrency. Root SLO
promotion remains blocked until the mixed workload, root workflow coverage, and
sustained evidence depth pass their gates.

## Verification

- `node --test tools/run-system-mixed-workload-benchmark.test.mjs tools/run-system-sustained-mixed-workload.test.mjs tools/run-system-sustained-mixed-workload-scaleup.test.mjs`
- `npm run verify:structure`: PASS
- `npm run quality`: PASS

## Next Step

Run a Docker-managed mixed workload scale-up using PgBouncer 180 and the P55
Identity shape. If that passes, compare read/write tail latency and DB queue
diagnostics before changing current whole-system source evidence.
