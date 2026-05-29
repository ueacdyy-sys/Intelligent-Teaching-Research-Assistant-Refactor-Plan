# Initial SDD/TDD Slice Report

## Scope

Created the executable refactor workspace and the first Go hot-path slice:

`services/conversation-write-gateway`

## Evidence

Commands run:

```powershell
npm run verify:structure
cd services/conversation-write-gateway
go mod tidy
go test ./...
npm test
go build -o tmp\bin\conversation-write-gateway.exe .\services\conversation-write-gateway\cmd\gateway
```

Results:

- Structure verifier passed.
- Go unit tests passed.
- Root `npm test` passed.
- Runtime smoke passed against PostgreSQL.

Smoke request:

`POST http://127.0.0.1:18080/v1/research/conversations`

Smoke response included:

```json
{
  "id": "conv_-qlLOsknHWiDQC4_d7LKF_zV",
  "title": "SDD Smoke Conversation",
  "messageCount": 0,
  "totalTokens": 0
}
```

Cleanup:

```sql
DELETE FROM research_conversations WHERE id = 'conv_-qlLOsknHWiDQC4_d7LKF_zV';
```

Confirmed `smoke_rows = 0`.

## Finding

Starting the Go gateway with only `DB_MAX_CONNS=4` still caused PostgreSQL connection exhaustion because the legacy backend had already expanded to 96 idle connections under prior load.

This confirms the P0b requirement:

- create a strict connection budget
- reduce async/sync engine multiplication
- add PgBouncer or increase PostgreSQL max connections in the performance environment
- record connection state in every performance run

## Next Slice

P0b should be implemented before putting Go gateway and legacy backend under combined load.
