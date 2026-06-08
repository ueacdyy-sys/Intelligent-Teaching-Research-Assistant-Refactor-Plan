# SDD 0324: Student App AI Tutor Model Execution Precheck

## Problem

SDD 0323 gives a claimed StudentTutorAgent worker a worker-safe `SAFE_TEXT_BLOCKS` study packet input. The next unsafe boundary is model execution admission: the system must not let a worker jump from safe text blocks to model inference without a recorded approval, budget, idempotency key, source evidence, and no-side-effect queue admission contract.

Before future AI Tutor answer generation, the worker needs an auditable precheck record that proves the 0323 worker input is READY and that model execution is approved, bounded, and still not started.

## Scope

Add a runtime evidence slice:

- runtime: `recordStudentAppAITutorModelExecutionPrecheck`
- command port: `StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck`
- report: `reports/student-app-ai-tutor-model-execution-precheck.current.json`

The runtime must:

- require a READY 0323 worker study packet input report
- require a service principal with `SERVICE + AGENT_INTERNAL + TEACHING_WRITE + AGENT_COMMAND_SUBMIT`
- require a reviewed approval for the same `requestId` and `workerId`
- require a queue-only model execution policy for `student_tutor_guided_help_v1`
- hash the safe text block input for replay safety
- record through an injected port and local JSONL command log
- support idempotent replay and reject conflicting replay attempts
- return only precheck ids, queue refs, policy metadata, hashes, and safety flags

## Non-Goals

This slice must not execute model inference, build final prompts, call HTTP, call databases, run tools, run Swarm, generate tutoring answers, generate question-bank drafts, write tutoring results, publish student-visible output, expose raw content, expose `contentRef`, expose answer keys, expose OCR/RAG chunks, or expose model output.

## Contracts

- Input may contain the worker-safe study packet response with `SAFE_TEXT_BLOCKS` blocks.
- The injected command port receives only ids, route, block count, input hash, approval id, policy, and evidence refs; it must not receive safe block text.
- Output must include `precheckId`, `queueRef`, `modelRoute`, `requestId`, `workerId`, `inputHash`, `safeBlockCount`, queue-only status, and safety boundary flags.
- Output must not include prompt text, raw content, `contentRef`, RAG chunks, answer keys, model output, result refs, or student-visible content.

## Acceptance Criteria

- Runtime tests prove positive record, idempotent replay, conflicting replay rejection, missing port rejection, unsafe principal rejection, unsafe policy rejection, source report rejection, leaked field rejection, unsafe port result rejection, and text-not-sent-to-port behavior.
- Audit verifies SDD 0323 readiness, runtime identity/idempotency, safety boundaries, runtime probe, negative test coverage, quality gate hook, root workflow coverage hook, structure verifier hook, root trace, and architecture board updates.
- Runtime SLO remains under 50ms.

## Performance Note

The runtime performs in-process validation, one SHA-256 hash, one injected command-port call, and one JSONL append in the audit probe. This is a control-plane precheck and should stay under the 50ms target. The current whole-system production10k evidence remains `22,435.1 read/write RPS`, `P99 44.44ms`, `0 errors`.

## Rollback

Remove the runtime/audit/test files, SDD 0324, report file, package script, quality-gate entry, root workflow coverage hook, structure verifier entry, root trace row, and architecture-board note. Keep SDD 0320-0323 and existing worker claim/result endpoints intact.
