# P0b Connection Budget Gate Report

## Scope

Added an executable connection budget gate for combined legacy + Go service testing.

Files added:

- `docs/sdd/0002-connection-budget-gate.md`
- `contracts/config/connection-budget.schema.json`
- `contracts/config/connection-budget.current.json`
- `contracts/config/connection-budget.safe-example.json`
- `tools/connection-budget.mjs`
- `tools/connection-budget.test.mjs`

Files updated:

- `package.json`
- `tools/verify-structure.mjs`
- `README.md`

## Test Evidence

Command:

```powershell
npm test
```

Result:

- structure verification passed
- tool tests passed: 3 passed
- Go tests passed

## Current Budget Evidence

Command:

```powershell
node tools\connection-budget.mjs --config contracts\config\connection-budget.current.json
```

Result:

```text
Connection budget: FAIL
planned=100
safeLimit=65
hardLimit=95
maxConnections=100

Services:
- legacy-fastapi-backend: instances=1, workers=24, poolConnections=4, planned=96
- conversation-write-gateway: instances=1, workers=1, poolConnections=4, planned=4
```

This matches the runtime finding: the legacy backend can expand to 96 idle PostgreSQL connections after load, leaving no safe room for the Go gateway under `max_connections=100`.

## Safe Example Evidence

Command:

```powershell
node tools\connection-budget.mjs --config contracts\config\connection-budget.safe-example.json
```

Result:

```text
Connection budget: PASS
planned=56
safeLimit=190
hardLimit=280
maxConnections=300
```

## Decision

Do not run combined legacy + Go high-concurrency tests on the current profile.

Next implementation should either:

- reduce legacy pool multiplication, especially sync research persistence pools
- add PgBouncer transaction pooling
- move performance tests to a PostgreSQL profile whose observed `max_connections`, `shared_buffers`, and memory budget match the intended load

## Next Slice

P0b continues with legacy database pool governance:

- identify all sync SQLAlchemy engines in the legacy backend
- decide which can become `NullPool`, shared singleton pools, or async adapters
- express the resulting profile in `contracts/config`
- rerun the connection budget gate before combined load tests
