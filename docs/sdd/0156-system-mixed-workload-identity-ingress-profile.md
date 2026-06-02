# SDD 0156: System Mixed Workload Identity Ingress Profile

## Problem

SDD 0155 selected `g12-p10-i16-c150` as the next Identity tuning baseline
candidate, but the system sustained mixed workload runners could not express
that shape. They could set Identity gateway workers and session DB pool size,
but not the Identity ingress proxy worker count or upstream transport profile.

That gap makes the next whole-system proof ambiguous. Passing Identity-only
evidence into a mixed workload by hand is easy to get wrong, and using the
shared HTTP connection settings for every module would accidentally apply the
Identity client transport profile to conversation writes as well.

## Source Requirement References

- Immutable root requirement: capacity evidence must support the whole assistant
  runtime and its teacher, student, research, admin, and remote entry points.
- SDD 0144: root SLO promotion remains blocked until mixed runtime evidence and
  workflow coverage are sufficient.
- SDD 0154: Identity phase matrix evidence compares gateway, pool, ingress, and
  transport fanout as a coupled shape.
- SDD 0155: the next honest proof is a mixed workload using the 180 PgBouncer
  candidate and the `g12-p10-i16-c150` Identity shape.

## Scope

In scope:

- Add Identity-specific HTTP client transport overrides to the mixed workload
  runner stack.
- Add Identity ingress proxy parameters to mixed, sustained, and sustained
  scale-up runners.
- Preserve backward compatibility by inheriting the shared HTTP transport
  settings when Identity-specific settings are omitted.
- Record Identity ingress and transport metadata in mixed, sustained, and
  scale-up rollup reports.
- Reject overlapping Identity ingress, Identity gateway, conversation gateway,
  and teaching gateway ports before running child workloads.

Out of scope:

- Running or promoting the full-system capacity claim.
- Replacing current source evidence before a mixed workload result passes.
- Changing Identity, conversation, or teaching public contracts.
- Adding training, OCR, RAG, vector, embedding, model, queue, or cache
  dependencies to the baseline.

## Contracts

The mixed workload runner accepts these Identity-specific options:

- `--identity-max-conns-per-host`
- `--identity-warm-connections-per-host`
- `--identity-ingress-proxy`
- `--identity-ingress-port`
- `--identity-ingress-count`
- `--identity-ingress-max-conns-per-host`
- `--identity-ingress-warm-connections-per-host`

If `--identity-max-conns-per-host` or
`--identity-warm-connections-per-host` is omitted, Identity inherits the shared
`--max-conns-per-host` and `--warm-connections-per-host` values. Conversation
continues to use the shared values.

Rollup reports include:

- `transportProfile.sharedMaxConnsPerHost`
- `transportProfile.sharedWarmConnectionsPerHost`
- `transportProfile.identityMaxConnsPerHost`
- `transportProfile.identityWarmConnectionsPerHost`
- `identityIngressProfile.enabled`
- `identityIngressProfile.basePort`
- `identityIngressProfile.workerCount`
- `identityIngressProfile.upstreamGatewayCount`
- `identityIngressProfile.maxConnsPerHost`
- `identityIngressProfile.warmConnectionsPerHost`

## Acceptance Criteria

- Focused tests prove mixed workload argument parsing, child command generation,
  port overlap rejection, and rollup metadata.
- Focused tests prove sustained runner sample options preserve Identity ingress
  and transport settings.
- Focused tests prove sustained scale-up step options preserve Identity ingress
  and transport settings.
- `npm run verify:structure` and strict quality remain passable.

## Performance Interpretation

This slice does not claim new capacity. It only makes the mixed workload
runner capable of testing the P55 candidate honestly:

```text
Identity gateway workers: 12
Identity session DB pool per worker: 10
Identity ingress workers: 16
Identity client max/warm connections per ingress target: 150/150
Identity ingress upstream max/warm connections per gateway target: 40/16
PgBouncer production candidate cap: 180
```

Only a later mixed workload run can decide whether that shape improves
whole-system read/write behavior under sustained load.

## Rollback

Remove the new Identity-specific runner options, report metadata, focused test
assertions, this SDD, and the structure verifier entry. The existing mixed
workload runners will return to shared HTTP transport settings only.
