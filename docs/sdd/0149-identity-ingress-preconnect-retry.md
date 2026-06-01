# SDD 0149: Identity Ingress Preconnect Retry

## Problem

The PgBouncer 120-headroom Identity probe failed during `refreshRotation` with
one `502 upstream unavailable`. The captured ingress log shows the proxy failed
before connecting to an upstream gateway:

`dial tcp 127.0.0.1:18100: bind: An operation on a socket could not be performed because the system lacked sufficient buffer space or because a queue was full.`

Gateway and ingress process exit codes were still null, so this is a local
transport fanout failure rather than a gateway crash or database-capacity
failure.

The current ingress proxy retries only safe GET/HEAD requests. That keeps
non-idempotent writes safe, but it also turns pre-connect `dial` failures into
immediate 502s even though no upstream received the request.

## Source Requirement References

- Immutable root requirement: identity/session flows must stay correct for
  teacher, student, research, and remote entry points.
- SDD 0146: high-fanout ingress can fail under Windows socket pressure.
- SDD 0148: PgBouncer headroom was applied, but the follow-up 4400-concurrency
  probe exposed ingress/upstream transport instability.

## Scope

In scope:

- Retry any request method on another upstream only when the transport error is
  a pre-connect `dial` error.
- Keep safe GET/HEAD retry behavior unchanged.
- Keep generic POST/refresh/password transport errors non-retried.
- Preserve public Identity HTTP contracts and session security semantics.

Out of scope:

- Retrying after request bytes might have reached an upstream.
- Changing refresh-token rotation semantics.
- Hiding failed benchmark evidence.
- Adding external load-balancer dependencies.
- Adding training, OCR, RAG, vector, embedding, or model-heavy dependencies.

## Contracts

- `safeReadRetryTransport` still retries GET/HEAD when the body is replayable.
- For non-safe methods, retry is allowed only for `net.OpError` with `Op ==
  "dial"`.
- All other non-safe transport errors return the original upstream error and
  remain visible as 502 responses.

## Acceptance Criteria

- A focused test proves POST refresh retries a `dial` error to a second
  upstream.
- Existing tests prove generic POST transport errors do not retry.
- Identity ingress proxy tests pass.
- Go tests and strict quality remain passable.
- A new benchmark report must be generated before changing any full-system
  capacity claim.

## Observability And Performance Evidence

The previous failed `pgbouncer120` report remains negative evidence for the old
ingress behavior. The next live run should show whether pre-connect retry
removes single upstream dial failures or whether local socket pressure still
overwhelms all upstream attempts.

Follow-up evidence:

- `reports/identity-http-benchmark.concurrency4400-multi6-ingress22-pool12-client200-unlogged-session-table-pgbouncer120-preconnect-retry-ingress19080-clean-table-docker-bench.json`
  passed the same 4400 logical-concurrency, six-gateway, 22-ingress,
  PgBouncer-120 profile with zero phase errors.
- This is resilience evidence for the ingress dial failure, not a full-system
  ultra-concurrency promotion: Identity tail latency is still over the root
  interactive SLO, with `revokeCycle.p99_ms` around 3071ms in the follow-up
  run.

## Rollback

Remove `isDialTransportError`, restore `canRetry` to safe-method-only behavior,
and remove the focused POST dial retry test.
