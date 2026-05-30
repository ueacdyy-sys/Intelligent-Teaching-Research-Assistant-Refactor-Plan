# P3 Teaching Archive Server Config Refactor

## Slice

- SDD: `docs/sdd/0059-teaching-archive-server-config-refactor.md`
- Root requirement anchor: Teaching Mode and Student App slices continue to expand under the immutable root requirements.
- Purpose: behavior-preserving HTTP composition refactor before more Teaching and Student App module slices.

## Change

- Added `httpapi.ServerConfig` as the named composition contract for Teaching Archive HTTP dependencies.
- Changed `httpapi.NewServer` from a 23-argument positional constructor to `NewServer(ServerConfig)`.
- Updated gateway startup wiring to use named fields while keeping `AGENT_API_KEY` defaulting to `ueacd`.
- Updated HTTP adapter tests to use named `ServerConfig` fields instead of positional `nil` lists.
- Added structure checks that keep the `ServerConfig` constructor shape from regressing.

## Red Evidence

`npm run verify:structure` failed before implementation with the expected missing file:

- `services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go`

## Green Evidence

- `go test ./services/teaching-archive-gateway/...`: PASS
- `npm run verify:structure`: PASS
- `npm test`: PASS, 108.0s
- `npm run quality`: PASS, 178.0s
- `services/agent-harness/target` cleanup check: `False`

Latest `reports/quality-gate.current.json`:

- allPassed: `true`
- elapsedMs: `176378`
- npm test: PASS, 108029ms
- go vet: PASS, 64395ms
- cargo test: PASS, 715ms
- identity session runtime audit: PASS
- identity access contract audit: PASS
- direct-limited connection budget: PASS
- pgbouncer connection budget: PASS

## Design Notes

- This slice does not change HTTP paths, response bodies, status codes, authorization, SQL, OpenAPI, or runtime behavior.
- The long constructor was a change-preventer smell: each future route dependency required editing unrelated test call sites.
- `ServerConfig` makes dependency wiring explicit and reduces silent positional miswiring risk.
- No package manifest changed.
- No OCR/RAG/model/training dependency was added.
