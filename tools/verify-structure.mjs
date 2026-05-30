import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "docs/development/sdd-tdd.md",
  "docs/adr/0001-polyglot-boundaries.md",
  "docs/sdd/0000-root-requirements-trace.md",
  "docs/sdd/0001-conversation-write-gateway.md",
  "docs/sdd/0002-connection-budget-gate.md",
  "docs/sdd/0003-legacy-db-pool-audit.md",
  "docs/sdd/0004-legacy-db-pool-remediation-plan.md",
  "docs/sdd/0005-pgbouncer-perf-profile.md",
  "docs/sdd/0006-identity-access-boundary.md",
  "docs/sdd/0007-identity-access-gateway.md",
  "docs/sdd/0008-identity-session-store.md",
  "docs/sdd/0009-identity-session-runtime-evidence.md",
  "docs/sdd/0010-identity-session-pgbouncer-runtime.md",
  "docs/sdd/0011-identity-session-concurrency-benchmark.md",
  "docs/sdd/0012-identity-http-gateway-benchmark.md",
  "docs/sdd/0013-identity-self-revoke-fast-path.md",
  "docs/sdd/0014-strict-quality-gate.md",
  "docs/sdd/0015-identity-wechat-session-flow.md",
  "docs/sdd/0016-identity-remote-command-replay-guard.md",
  "docs/sdd/0017-agent-harness-permission-manifest.md",
  "docs/sdd/0018-agent-harness-audit-evidence.md",
  "docs/sdd/0019-agent-harness-dry-run-adapters.md",
  "docs/sdd/0020-agent-harness-jsonl-evidence-store.md",
  "docs/sdd/0021-agent-harness-filesystem-metadata-dry-run.md",
  "docs/sdd/0022-agent-harness-persistent-dry-run-evidence.md",
  "docs/sdd/0023-agent-harness-persistent-filesystem-metadata-dry-run.md",
  "docs/sdd/0024-agent-harness-approval-artifact.md",
  "docs/sdd/0025-agent-harness-approval-decision.md",
  "docs/sdd/0026-agent-harness-approval-decision-correlation.md",
  "docs/sdd/0027-agent-harness-approval-queue-reader.md",
  "docs/sdd/0028-agent-harness-execution-candidate-view.md",
  "docs/sdd/0029-teaching-archive-material-intake.md",
  "docs/sdd/0030-teaching-archive-query-view.md",
  "docs/sdd/0031-teaching-archive-principal-authorization.md",
  "docs/sdd/0032-teaching-archive-student-query-scope.md",
  "docs/sdd/0033-teaching-archive-tutoring-analysis-request.md",
  "docs/sdd/0034-teaching-archive-tutoring-analysis-query-view.md",
  "docs/sdd/0035-teaching-archive-tutoring-analysis-worker-result.md",
  "docs/sdd/0036-teaching-archive-tutoring-analysis-worker-claim.md",
  "docs/sdd/0037-teaching-archive-tutoring-analysis-result-lease-guard.md",
  "docs/sdd/0038-teaching-archive-ai-grading-request.md",
  "docs/sdd/0039-teaching-archive-ai-grading-query-view.md",
  "docs/sdd/0040-teaching-archive-ai-grading-worker-claim.md",
  "docs/sdd/0041-teaching-archive-quality-headroom-split.md",
  "docs/sdd/0042-teaching-archive-http-runtime-headroom-split.md",
  "docs/sdd/0043-teaching-archive-postgres-repository-headroom-split.md",
  "docs/sdd/0044-teaching-archive-ai-grading-worker-result.md",
  "docs/sdd/0045-teaching-archive-quiz-submission-intake.md",
  "docs/sdd/0046-teaching-archive-quiz-submission-query-view.md",
  "docs/sdd/0047-teaching-archive-ai-grading-source-content-ref.md",
  "docs/sdd/0048-teaching-archive-quiz-submission-ai-grading-bridge.md",
  "docs/sdd/0049-teaching-attendance-session-intake.md",
  "docs/sdd/0050-teaching-archive-contract-http-headroom-split.md",
  "docs/sdd/0051-teaching-attendance-record-intake.md",
  "docs/sdd/0052-teaching-attendance-record-query-view.md",
  "docs/sdd/0053-teaching-attendance-student-history-query-view.md",
  "docs/sdd/0054-teaching-attendance-statistics-query-view.md",
  "docs/sdd/0055-teaching-attendance-student-sign-in.md",
  "docs/sdd/0056-teaching-attendance-session-end.md",
  "docs/sdd/0057-teaching-attendance-random-selection.md",
  "docs/sdd/0058-teaching-quiz-scan-submission.md",
  "docs/sdd/0059-teaching-archive-server-config-refactor.md",
  "docs/roadmap/refactor-backlog.md",
  "docs/roadmap/whole-system-module-map.md",
  "contracts/openapi/identity-access.yaml",
  "contracts/openapi/conversation-write-gateway.yaml",
  "contracts/openapi/teaching-archive.yaml",
  "contracts/openapi/teaching-archive.archive-items.path.yaml",
  "contracts/openapi/teaching-archive.archive-item-tutoring-analysis-requests.path.yaml",
  "contracts/openapi/teaching-archive.archive-item-ai-grading-requests.path.yaml",
  "contracts/openapi/teaching-archive.attendance-sessions.path.yaml",
  "contracts/openapi/teaching-archive.attendance-session-records.path.yaml",
  "contracts/openapi/teaching-archive.student-attendance-records.path.yaml",
  "contracts/openapi/teaching-archive.attendance-statistics.path.yaml",
  "contracts/openapi/teaching-archive.attendance-session-sign-ins.path.yaml",
  "contracts/openapi/teaching-archive.attendance-session-end.path.yaml",
  "contracts/openapi/teaching-archive.attendance-session-random-selections.path.yaml",
  "contracts/openapi/teaching-archive.quiz-submissions.path.yaml",
  "contracts/openapi/teaching-archive.quiz-scan-submissions.path.yaml",
  "contracts/openapi/teaching-archive.quiz-submission-ai-grading-requests.path.yaml",
  "contracts/openapi/teaching-archive.ai-grading-requests.path.yaml",
  "contracts/openapi/teaching-archive.ai-grading-worker-claims.path.yaml",
  "contracts/openapi/teaching-archive.ai-grading-worker-result.path.yaml",
  "contracts/openapi/teaching-archive.tutoring-analysis-requests.path.yaml",
  "contracts/openapi/teaching-archive.tutoring-analysis-worker-claims.path.yaml",
  "contracts/openapi/teaching-archive.tutoring-analysis-worker-result.path.yaml",
  "contracts/auth/principal-context.schema.json",
  "contracts/auth/access-matrix.json",
  "contracts/sql/identity-sessions.sql",
  "contracts/sql/teaching-archive.sql",
  "contracts/harness/permission-manifest.schema.json",
  "contracts/harness/permission-manifest.current.json",
  "contracts/harness/audit-evidence.schema.json",
  "contracts/harness/audit-evidence.example.json",
  "contracts/harness/approval-artifact.schema.json",
  "contracts/harness/approval-artifact.example.json",
  "contracts/harness/approval-decision.schema.json",
  "contracts/harness/approval-decision.example.json",
  "contracts/harness/approval-decision-correlation.schema.json",
  "contracts/harness/approval-decision-correlation.example.json",
  "contracts/harness/approval-queue-snapshot.schema.json",
  "contracts/harness/approval-queue-snapshot.example.json",
  "contracts/harness/execution-candidate-view.schema.json",
  "contracts/harness/execution-candidate-view.example.json",
  "contracts/events/research-events.schema.json",
  "contracts/config/connection-budget.schema.json",
  "contracts/config/connection-budget.current.json",
  "contracts/config/connection-budget.current-audited-worst-case.json",
  "contracts/config/connection-budget.proposed-direct-limited.json",
  "contracts/config/connection-budget.proposed-pgbouncer-transaction.json",
  "contracts/config/legacy-db-pool-audit.schema.json",
  "contracts/config/legacy-db-pool-remediation.schema.json",
  "contracts/config/pgbouncer-perf-profile.schema.json",
  "contracts/config/pgbouncer-perf-profile.current.json",
  "contracts/config/pgbouncer-perf-profile.proposed.json",
  "infra/perf/docker-compose.pgbouncer.override.yml",
  "infra/perf/docker-compose.identity-session.yml",
  "infra/perf/identity-session-pgbouncer.ini",
  "infra/perf/identity-session-userlist.txt",
  "services/conversation-write-gateway/go.mod",
  "services/identity-access-gateway/go.mod",
  "services/teaching-archive-gateway/go.mod",
  "services/teaching-archive-gateway/go.sum",
  "services/teaching-archive-gateway/cmd/gateway/main.go",
  "services/teaching-archive-gateway/internal/domain/archive.go",
  "services/teaching-archive-gateway/internal/domain/quiz_submission.go",
  "services/teaching-archive-gateway/internal/domain/quiz_submission_test.go",
  "services/teaching-archive-gateway/internal/domain/quiz_scan_submission.go",
  "services/teaching-archive-gateway/internal/domain/quiz_scan_submission_test.go",
  "services/teaching-archive-gateway/internal/domain/quiz_submission_query.go",
  "services/teaching-archive-gateway/internal/domain/quiz_submission_query_test.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_request.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_request_test.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_query.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_claim.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_claim_test.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_result.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_result_test.go",
  "services/teaching-archive-gateway/internal/domain/archive_query.go",
  "services/teaching-archive-gateway/internal/domain/attendance_record.go",
  "services/teaching-archive-gateway/internal/domain/attendance_record_test.go",
  "services/teaching-archive-gateway/internal/domain/attendance_record_query.go",
  "services/teaching-archive-gateway/internal/domain/attendance_record_query_test.go",
  "services/teaching-archive-gateway/internal/domain/student_attendance_record_query.go",
  "services/teaching-archive-gateway/internal/domain/student_attendance_record_query_test.go",
  "services/teaching-archive-gateway/internal/domain/attendance_statistics.go",
  "services/teaching-archive-gateway/internal/domain/attendance_statistics_test.go",
  "services/teaching-archive-gateway/internal/domain/attendance_sign_in.go",
  "services/teaching-archive-gateway/internal/domain/attendance_sign_in_test.go",
  "services/teaching-archive-gateway/internal/domain/attendance_session_end.go",
  "services/teaching-archive-gateway/internal/domain/attendance_session_end_test.go",
  "services/teaching-archive-gateway/internal/domain/attendance_random_selection.go",
  "services/teaching-archive-gateway/internal/domain/attendance_random_selection_test.go",
  "services/teaching-archive-gateway/internal/domain/principal.go",
  "services/teaching-archive-gateway/internal/domain/tutoring_analysis_query.go",
  "services/teaching-archive-gateway/internal/domain/tutoring_analysis_claim.go",
  "services/teaching-archive-gateway/internal/domain/tutoring_analysis_claim_test.go",
  "services/teaching-archive-gateway/internal/domain/tutoring_analysis_result.go",
  "services/teaching-archive-gateway/internal/domain/archive_authorization_test.go",
  "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_archive_item.go",
  "services/teaching-archive-gateway/internal/usecase/create_archive_item_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_quiz_submission.go",
  "services/teaching-archive-gateway/internal/usecase/create_quiz_submission_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_scanned_quiz_submission.go",
  "services/teaching-archive-gateway/internal/usecase/create_scanned_quiz_submission_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_quiz_submissions.go",
  "services/teaching-archive-gateway/internal/usecase/list_quiz_submissions_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_ai_grading_request.go",
  "services/teaching-archive-gateway/internal/usecase/create_ai_grading_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_quiz_submission_ai_grading_request.go",
  "services/teaching-archive-gateway/internal/usecase/create_quiz_submission_ai_grading_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_attendance_session.go",
  "services/teaching-archive-gateway/internal/usecase/create_attendance_session_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_attendance_record.go",
  "services/teaching-archive-gateway/internal/usecase/create_attendance_record_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_attendance_records.go",
  "services/teaching-archive-gateway/internal/usecase/list_attendance_records_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_student_attendance_records.go",
  "services/teaching-archive-gateway/internal/usecase/list_student_attendance_records_test.go",
  "services/teaching-archive-gateway/internal/usecase/get_attendance_statistics.go",
  "services/teaching-archive-gateway/internal/usecase/get_attendance_statistics_test.go",
  "services/teaching-archive-gateway/internal/usecase/sign_in_attendance.go",
  "services/teaching-archive-gateway/internal/usecase/sign_in_attendance_test.go",
  "services/teaching-archive-gateway/internal/usecase/end_attendance_session.go",
  "services/teaching-archive-gateway/internal/usecase/end_attendance_session_test.go",
  "services/teaching-archive-gateway/internal/usecase/select_attendance_random_students.go",
  "services/teaching-archive-gateway/internal/usecase/select_attendance_random_students_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_ai_grading_requests.go",
  "services/teaching-archive-gateway/internal/usecase/list_ai_grading_requests_test.go",
  "services/teaching-archive-gateway/internal/usecase/claim_ai_grading_request.go",
  "services/teaching-archive-gateway/internal/usecase/claim_ai_grading_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/record_ai_grading_result.go",
  "services/teaching-archive-gateway/internal/usecase/record_ai_grading_result_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_tutoring_analysis_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_archive_items.go",
  "services/teaching-archive-gateway/internal/usecase/list_archive_items_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_tutoring_analysis_requests.go",
  "services/teaching-archive-gateway/internal/usecase/list_tutoring_analysis_requests_test.go",
  "services/teaching-archive-gateway/internal/usecase/claim_tutoring_analysis_request.go",
  "services/teaching-archive-gateway/internal/usecase/claim_tutoring_analysis_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result.go",
  "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result_test.go",
  "services/teaching-archive-gateway/internal/usecase/principal_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_archive_items.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_record.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_record_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_record_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_attendance_record.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_attendance_record_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_statistics.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_statistics_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_sign_in.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_sign_in_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_session_end.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_session_end_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_random_selection.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_random_selection_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_request_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_query.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_claim.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_claim_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_result_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_submission_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_scan_submission.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_scan_submission_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_submission_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_test_helpers_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_requests.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission_query.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_record.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_record_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_record_query.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_record_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_student_attendance_record_query.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_student_attendance_record_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_statistics.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_statistics_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_session_end.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_session_end_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_random_selection.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_random_selection_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_helpers.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_claim.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_claim_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_result.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/pool_db.go",
  "services/teaching-archive-gateway/internal/platform/runtime.go",
  "tools/identity-session-runtime-profile-audit.mjs",
  "tools/run-identity-session-integration.mjs",
  "tools/run-identity-session-benchmark.mjs",
  "tools/identity-session-benchmark-summary.mjs",
  "services/identity-access-gateway/cmd/sessionbench/main.go",
  "tools/run-identity-http-benchmark.mjs",
  "services/identity-access-gateway/cmd/httpbench/main.go",
  "tools/quality-gate.mjs",
  "tools/quality-gate.test.mjs",
  "services/identity-access-gateway/internal/adapter/bootstrap/wechat_authenticator.go",
  "services/agent-harness/Cargo.toml",
  "services/agent-harness/Cargo.lock",
  "services/agent-harness/src/lib.rs",
  "services/agent-harness/src/approval_decision.rs",
  "services/agent-harness/src/approval_correlation.rs",
  "services/agent-harness/src/approval_queue.rs",
  "services/agent-harness/src/execution_candidate.rs",
  "services/agent-harness/tests/permission_manifest.rs",
  "services/agent-harness/tests/audit_evidence.rs",
  "services/agent-harness/tests/dry_run_harness.rs",
  "services/agent-harness/tests/jsonl_evidence_store.rs",
  "services/agent-harness/tests/filesystem_metadata_dry_run.rs",
  "services/agent-harness/tests/persistent_dry_run_evidence.rs",
  "services/agent-harness/tests/persistent_filesystem_metadata_dry_run.rs",
  "services/agent-harness/tests/approval_artifact.rs",
  "services/agent-harness/tests/approval_decision.rs",
  "services/agent-harness/tests/approval_decision_correlation.rs",
  "services/agent-harness/tests/approval_queue_reader.rs",
  "services/agent-harness/tests/execution_candidate_view.rs",
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error("Missing required refactor files:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const sdd = fs.readFileSync(path.join(root, "docs/sdd/0001-conversation-write-gateway.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contract", "## Acceptance Criteria", "## Rollback"]) {
  if (!sdd.includes(heading)) {
    console.error(`SDD 0001 missing heading: ${heading}`);
    process.exit(1);
  }
}

const wholeSystemMap = fs.readFileSync(path.join(root, "docs/roadmap/whole-system-module-map.md"), "utf8");
for (const invariant of [
  "Root Requirements Are The Product Boundary",
  "One Module At A Time",
  "Teaching Mode",
  "Research Mode",
  "Student App",
  "Agent Harness",
]) {
  if (!wholeSystemMap.includes(invariant)) {
    console.error(`Whole system module map missing invariant: ${invariant}`);
    process.exit(1);
  }
}

const identitySdd = fs.readFileSync(path.join(root, "docs/sdd/0006-identity-access-boundary.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identitySdd.includes(heading)) {
    console.error(`SDD 0006 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identityGatewaySdd = fs.readFileSync(path.join(root, "docs/sdd/0007-identity-access-gateway.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identityGatewaySdd.includes(heading)) {
    console.error(`SDD 0007 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identitySessionStoreSdd = fs.readFileSync(path.join(root, "docs/sdd/0008-identity-session-store.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identitySessionStoreSdd.includes(heading)) {
    console.error(`SDD 0008 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identitySessionRuntimeSdd = fs.readFileSync(path.join(root, "docs/sdd/0009-identity-session-runtime-evidence.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identitySessionRuntimeSdd.includes(heading)) {
    console.error(`SDD 0009 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identitySessionPgbouncerSdd = fs.readFileSync(path.join(root, "docs/sdd/0010-identity-session-pgbouncer-runtime.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identitySessionPgbouncerSdd.includes(heading)) {
    console.error(`SDD 0010 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identitySessionBenchmarkSdd = fs.readFileSync(path.join(root, "docs/sdd/0011-identity-session-concurrency-benchmark.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identitySessionBenchmarkSdd.includes(heading)) {
    console.error(`SDD 0011 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identityHTTPBenchmarkSdd = fs.readFileSync(path.join(root, "docs/sdd/0012-identity-http-gateway-benchmark.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identityHTTPBenchmarkSdd.includes(heading)) {
    console.error(`SDD 0012 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identitySelfRevokeSdd = fs.readFileSync(path.join(root, "docs/sdd/0013-identity-self-revoke-fast-path.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identitySelfRevokeSdd.includes(heading)) {
    console.error(`SDD 0013 missing heading: ${heading}`);
    process.exit(1);
  }
}

const strictQualitySdd = fs.readFileSync(path.join(root, "docs/sdd/0014-strict-quality-gate.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!strictQualitySdd.includes(heading)) {
    console.error(`SDD 0014 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identityWeChatSdd = fs.readFileSync(path.join(root, "docs/sdd/0015-identity-wechat-session-flow.md"), "utf8");
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identityWeChatSdd.includes(heading)) {
    console.error(`SDD 0015 missing heading: ${heading}`);
    process.exit(1);
  }
}

const identityRemoteReplaySdd = fs.readFileSync(
  path.join(root, "docs/sdd/0016-identity-remote-command-replay-guard.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!identityRemoteReplaySdd.includes(heading)) {
    console.error(`SDD 0016 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessPermissionSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0017-agent-harness-permission-manifest.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessPermissionSdd.includes(heading)) {
    console.error(`SDD 0017 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessEvidenceSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0018-agent-harness-audit-evidence.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessEvidenceSdd.includes(heading)) {
    console.error(`SDD 0018 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessDryRunSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0019-agent-harness-dry-run-adapters.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessDryRunSdd.includes(heading)) {
    console.error(`SDD 0019 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessJsonlEvidenceSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0020-agent-harness-jsonl-evidence-store.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessJsonlEvidenceSdd.includes(heading)) {
    console.error(`SDD 0020 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessFilesystemMetadataSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0021-agent-harness-filesystem-metadata-dry-run.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessFilesystemMetadataSdd.includes(heading)) {
    console.error(`SDD 0021 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessPersistentDryRunSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0022-agent-harness-persistent-dry-run-evidence.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessPersistentDryRunSdd.includes(heading)) {
    console.error(`SDD 0022 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessPersistentFilesystemMetadataSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0023-agent-harness-persistent-filesystem-metadata-dry-run.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessPersistentFilesystemMetadataSdd.includes(heading)) {
    console.error(`SDD 0023 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessApprovalArtifactSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0024-agent-harness-approval-artifact.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessApprovalArtifactSdd.includes(heading)) {
    console.error(`SDD 0024 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessApprovalDecisionSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0025-agent-harness-approval-decision.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessApprovalDecisionSdd.includes(heading)) {
    console.error(`SDD 0025 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessApprovalDecisionCorrelationSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0026-agent-harness-approval-decision-correlation.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessApprovalDecisionCorrelationSdd.includes(heading)) {
    console.error(`SDD 0026 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessApprovalQueueReaderSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0027-agent-harness-approval-queue-reader.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessApprovalQueueReaderSdd.includes(heading)) {
    console.error(`SDD 0027 missing heading: ${heading}`);
    process.exit(1);
  }
}

const agentHarnessExecutionCandidateViewSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0028-agent-harness-execution-candidate-view.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!agentHarnessExecutionCandidateViewSdd.includes(heading)) {
    console.error(`SDD 0028 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0029-teaching-archive-material-intake.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveSdd.includes(heading)) {
    console.error(`SDD 0029 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveQuerySdd = fs.readFileSync(
  path.join(root, "docs/sdd/0030-teaching-archive-query-view.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveQuerySdd.includes(heading)) {
    console.error(`SDD 0030 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchivePrincipalSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0031-teaching-archive-principal-authorization.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchivePrincipalSdd.includes(heading)) {
    console.error(`SDD 0031 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveStudentScopeSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0032-teaching-archive-student-query-scope.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveStudentScopeSdd.includes(heading)) {
    console.error(`SDD 0032 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveTutoringAnalysisSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0033-teaching-archive-tutoring-analysis-request.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveTutoringAnalysisSdd.includes(heading)) {
    console.error(`SDD 0033 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveTutoringAnalysisQuerySdd = fs.readFileSync(
  path.join(root, "docs/sdd/0034-teaching-archive-tutoring-analysis-query-view.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveTutoringAnalysisQuerySdd.includes(heading)) {
    console.error(`SDD 0034 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveTutoringAnalysisWorkerResultSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0035-teaching-archive-tutoring-analysis-worker-result.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveTutoringAnalysisWorkerResultSdd.includes(heading)) {
    console.error(`SDD 0035 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveTutoringAnalysisWorkerClaimSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0036-teaching-archive-tutoring-analysis-worker-claim.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveTutoringAnalysisWorkerClaimSdd.includes(heading)) {
    console.error(`SDD 0036 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveTutoringAnalysisResultLeaseGuardSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0037-teaching-archive-tutoring-analysis-result-lease-guard.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveTutoringAnalysisResultLeaseGuardSdd.includes(heading)) {
    console.error(`SDD 0037 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveAIGradingRequestSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0038-teaching-archive-ai-grading-request.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveAIGradingRequestSdd.includes(heading)) {
    console.error(`SDD 0038 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveAIGradingQuerySdd = fs.readFileSync(
  path.join(root, "docs/sdd/0039-teaching-archive-ai-grading-query-view.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveAIGradingQuerySdd.includes(heading)) {
    console.error(`SDD 0039 missing heading: ${heading}`);
    process.exit(1);
  }
}

const teachingArchiveAIGradingClaimSdd = fs.readFileSync(
  path.join(root, "docs/sdd/0040-teaching-archive-ai-grading-worker-claim.md"),
  "utf8",
);
for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
  if (!teachingArchiveAIGradingClaimSdd.includes(heading)) {
    console.error(`SDD 0040 missing heading: ${heading}`);
    process.exit(1);
  }
}

for (const [id, file] of [
  ["0041", "0041-teaching-archive-quality-headroom-split.md"],
  ["0042", "0042-teaching-archive-http-runtime-headroom-split.md"],
  ["0043", "0043-teaching-archive-postgres-repository-headroom-split.md"],
  ["0044", "0044-teaching-archive-ai-grading-worker-result.md"],
  ["0045", "0045-teaching-archive-quiz-submission-intake.md"],
  ["0046", "0046-teaching-archive-quiz-submission-query-view.md"],
  ["0047", "0047-teaching-archive-ai-grading-source-content-ref.md"],
  ["0048", "0048-teaching-archive-quiz-submission-ai-grading-bridge.md"],
  ["0049", "0049-teaching-attendance-session-intake.md"],
  ["0050", "0050-teaching-archive-contract-http-headroom-split.md"],
  ["0051", "0051-teaching-attendance-record-intake.md"],
  ["0052", "0052-teaching-attendance-record-query-view.md"],
  ["0053", "0053-teaching-attendance-student-history-query-view.md"],
  ["0054", "0054-teaching-attendance-statistics-query-view.md"],
  ["0055", "0055-teaching-attendance-student-sign-in.md"],
  ["0056", "0056-teaching-attendance-session-end.md"],
  ["0057", "0057-teaching-attendance-random-selection.md"],
  ["0058", "0058-teaching-quiz-scan-submission.md"],
  ["0059", "0059-teaching-archive-server-config-refactor.md"],
]) {
  const sdd = fs.readFileSync(path.join(root, "docs/sdd", file), "utf8");
  for (const heading of ["## Problem", "## Scope", "## Contracts", "## Acceptance Criteria", "## Rollback"]) {
    if (!sdd.includes(heading)) {
      console.error(`SDD ${id} missing heading: ${heading}`);
      process.exit(1);
    }
  }
}

const teachingArchiveServerGo = fs.readFileSync(
  path.join(root, "services/teaching-archive-gateway/internal/adapter/httpapi/server.go"),
  "utf8",
);
if (!teachingArchiveServerGo.includes("func NewServer(config ServerConfig) *Server")) {
  console.error("Teaching Archive HTTP server constructor must accept ServerConfig.");
  process.exit(1);
}

const teachingArchiveServerConfigGo = fs.readFileSync(
  path.join(root, "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go"),
  "utf8",
);
for (const field of [
  "CreateArchiveItem",
  "ListArchiveItems",
  "CreateQuizSubmission",
  "CreateScannedQuizSubmission",
  "CreateAttendanceSession",
  "SelectAttendanceRandomStudents",
  "AgentAPIKey",
]) {
  if (!teachingArchiveServerConfigGo.includes(field)) {
    console.error(`Teaching Archive ServerConfig missing field: ${field}`);
    process.exit(1);
  }
}

const lineCount = (file) => fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/).length;
const qualityHeadroomLimits = [
  ["contracts/openapi/teaching-archive.yaml", 620],
  ["services/teaching-archive-gateway/internal/adapter/httpapi/server.go", 140],
  ["services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go", 500],
  ["services/teaching-archive-gateway/internal/adapter/postgres/repository.go", 180],
];
for (const [file, maxLines] of qualityHeadroomLimits) {
  const lines = lineCount(file);
  if (lines > maxLines) {
    console.error(`${file} exceeds quality headroom: ${lines} lines > ${maxLines}`);
    process.exit(1);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.scripts?.quality !== "node tools/quality-gate.mjs") {
  console.error("package.json missing strict quality script.");
  process.exit(1);
}
if (!packageJson.scripts?.["test:go"]?.includes("./services/teaching-archive-gateway/...")) {
  console.error("package.json test:go does not include Teaching Archive Gateway.");
  process.exit(1);
}
if (packageJson.scripts?.["test:rust"] !== "cargo test --manifest-path services/agent-harness/Cargo.toml") {
  console.error("package.json missing Rust harness test script.");
  process.exit(1);
}

console.log("Refactor structure verified.");
