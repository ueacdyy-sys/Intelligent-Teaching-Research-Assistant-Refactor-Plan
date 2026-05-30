import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const required = [
  "docs/development/sdd-tdd.md",
  "docs/adr/0001-polyglot-boundaries.md",
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
  "contracts/openapi/teaching-archive.student-app-teaching-materials.path.yaml",
  "contracts/openapi/teaching-archive.student-app-archive-items.path.yaml",
  "contracts/openapi/teaching-archive.student-app-quiz-submissions.path.yaml", "contracts/openapi/teaching-archive.student-app-quiz-scan-submissions.path.yaml", "contracts/openapi/teaching-archive.student-app-question-bank-drafts.path.yaml",
  "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
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
  "contracts/harness/execution-candidate-view.example.json", "contracts/harness/rollback-review.schema.json", "contracts/harness/rollback-review.example.json",
  "contracts/workflow/workflow-plugin-draft.schema.json",
  "contracts/workflow/workflow-plugin-sandbox-run.schema.json",
  "contracts/workflow/workflow-plugin-approval.schema.json",
  "contracts/workflow/workflow-plugin-registry-entry.schema.json",
  "contracts/workflow/workflow-plugin-registry-admission.schema.json",
  "contracts/workflow/workflow-plugin-revision-request.schema.json",
  "contracts/workflow/workflow-draft.example.json",
  "contracts/workflow/plugin-draft.example.json",
  "contracts/workflow/workflow-plugin-sandbox-run.example.json",
  "contracts/workflow/workflow-plugin-approval.example.json",
  "contracts/workflow/workflow-plugin-registry-entry.example.json",
  "contracts/workflow/workflow-plugin-registry-admission.example.json",
  "contracts/workflow/workflow-plugin-revision-request.example.json",
  "contracts/ai-worker/ai-worker-job.schema.json",
  "contracts/ai-worker/ai-worker-result.schema.json",
  "contracts/ai-worker/ai-worker-job.examples.json",
  "contracts/ai-worker/ai-worker-result.example.json",
  "contracts/ai-worker/ai-worker-admission.schema.json",
  "contracts/ai-worker/ai-worker-admission.example.json",
  "contracts/ai-worker/ai-worker-runtime-dependency-profile.schema.json",
  "contracts/ai-worker/ai-worker-runtime-dependency-profile.current.json",
  "contracts/ops/performance-evidence-registry.schema.json",
  "contracts/ops/performance-evidence-registry.current.json",
  "contracts/knowledge/knowledge-access-policy.schema.json",
  "contracts/knowledge/knowledge-access-policy.current.json",
  "contracts/knowledge/knowledge-retrieval-benchmark.schema.json",
  "contracts/knowledge/knowledge-retrieval-benchmark.current.json",
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
  "services/teaching-archive-gateway/internal/domain/student_app_teaching_materials.go", "services/teaching-archive-gateway/internal/domain/student_app_teaching_materials_test.go",
  "services/teaching-archive-gateway/internal/domain/student_app_archive_items.go", "services/teaching-archive-gateway/internal/domain/student_app_archive_items_test.go",
  "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go", "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_test.go",
  "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go", "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests_test.go",
  "services/teaching-archive-gateway/internal/domain/student_app_quiz_submissions.go", "services/teaching-archive-gateway/internal/domain/student_app_quiz_submissions_test.go", "services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts.go", "services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts_test.go",
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
  "services/teaching-archive-gateway/internal/usecase/list_student_app_teaching_materials.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_teaching_materials_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go", "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_student_app_quiz_submissions.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_quiz_submissions_test.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts_test.go",
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
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_teaching_materials.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_teaching_materials_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_submissions.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_submissions_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_scan_submission.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_scan_submission_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts_test.go",
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
  "tools/quality-gate.test.mjs", "tools/pgbouncer-perf-profile-audit.mjs", "tools/pgbouncer-perf-profile-audit.test.mjs", "tools/student-app-flow-audit.mjs", "tools/student-app-flow-audit.test.mjs", "tools/agent-harness-flow-audit.mjs", "tools/agent-harness-flow-audit.test.mjs", "tools/workflow-plugin-flow-audit.mjs", "tools/workflow-plugin-flow-audit.test.mjs", "tools/workflow-plugin-registry-admission.mjs", "tools/workflow-plugin-registry-admission.test.mjs", "tools/workflow-plugin-revision-feedback.mjs", "tools/workflow-plugin-revision-feedback.test.mjs", "tools/ai-worker-job-audit.mjs", "tools/ai-worker-job-audit.test.mjs", "tools/knowledge-access-policy-audit.mjs", "tools/knowledge-access-policy-audit.test.mjs", "tools/ai-worker-job-admission.mjs", "tools/ai-worker-job-admission.test.mjs", "tools/knowledge-retrieval-benchmark-audit.mjs", "tools/knowledge-retrieval-benchmark-audit.test.mjs", "tools/ai-worker-runtime-dependency-profile-audit.mjs", "tools/ai-worker-runtime-dependency-profile-audit.test.mjs", "tools/performance-evidence-registry-audit.mjs", "tools/performance-evidence-registry-audit.test.mjs", "tools/verify-structure-sdd-discovery.test.mjs",
  "services/identity-access-gateway/internal/adapter/bootstrap/wechat_authenticator.go", "services/identity-access-gateway/internal/domain/student_app_profile.go", "services/identity-access-gateway/internal/domain/student_app_profile_test.go", "services/identity-access-gateway/internal/usecase/student_app_profile.go", "services/identity-access-gateway/internal/usecase/student_app_profile_test.go", "services/identity-access-gateway/internal/adapter/httpapi/server_student_app_profile.go", "services/identity-access-gateway/internal/adapter/httpapi/server_student_app_profile_test.go",
  "services/agent-harness/Cargo.toml",
  "services/agent-harness/Cargo.lock",
  "services/agent-harness/src/lib.rs",
  "services/agent-harness/src/approval_decision.rs",
  "services/agent-harness/src/approval_correlation.rs",
  "services/agent-harness/src/approval_queue.rs",
  "services/agent-harness/src/execution_candidate.rs", "services/agent-harness/src/rollback_review.rs",
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
  "services/agent-harness/tests/execution_candidate_view.rs", "services/agent-harness/tests/rollback_review.rs",
];

export function discoverSddDocuments(rootDir = root) {
  const sddDir = path.join(rootDir, "docs", "sdd");
  if (!fs.existsSync(sddDir)) return [];
  return fs.readdirSync(sddDir)
    .filter((file) => /^\d{4}-.+\.md$/.test(file))
    .map((file) => ({
      id: file.slice(0, 4),
      number: Number(file.slice(0, 4)),
      file,
      path: path.join(sddDir, file),
    }))
    .sort((left, right) => left.number - right.number || left.file.localeCompare(right.file));
}

export function verifySddDocuments(rootDir = root) {
  const findings = [];
  const docs = discoverSddDocuments(rootDir);
  if (docs.length === 0) {
    return [{ message: "No SDD documents found in docs/sdd." }];
  }

  const seen = new Set();
  for (const doc of docs) {
    if (seen.has(doc.id)) {
      findings.push({ message: `Duplicate SDD id: ${doc.id}` });
    }
    seen.add(doc.id);
  }

  for (let index = 0; index < docs.length; index += 1) {
    if (docs[index].number !== index) {
      findings.push({ message: `missing SDD ${formatSddId(index)} before ${docs[index].file}` });
      break;
    }
  }

  for (const doc of docs) {
    const text = fs.readFileSync(doc.path, "utf8");
    const requiredHeadings = doc.id === "0000"
      ? ["## Authoritative Source", "## Product Capabilities", "## Non-Negotiable Invariants"]
      : ["## Problem", "## Scope", "## Acceptance Criteria", "## Rollback"];
    for (const heading of requiredHeadings) {
      if (!text.includes(heading)) {
        findings.push({ message: `SDD ${doc.id} missing heading: ${heading}` });
      }
    }
    if (doc.id !== "0000" && !text.includes("## Contract") && !text.includes("## Contracts")) {
      findings.push({ message: `SDD ${doc.id} missing heading: ## Contracts` });
    }
  }

  return findings;
}

export function formatSddId(value) {
  return String(value).padStart(4, "0");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
  if (missing.length > 0) {
    console.error("Missing required refactor files:");
    for (const file of missing) console.error(`- ${file}`);
    process.exit(1);
  }

  for (const finding of verifySddDocuments(root)) {
    fail(finding.message);
  }

  const teachingArchiveServerGo = fs.readFileSync(
    path.join(root, "services/teaching-archive-gateway/internal/adapter/httpapi/server.go"),
    "utf8",
  );
  if (!teachingArchiveServerGo.includes("func NewServer(config ServerConfig) *Server")) {
    fail("Teaching Archive HTTP server constructor must accept ServerConfig.");
  }

  const teachingArchiveServerConfigGo = fs.readFileSync(
    path.join(root, "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go"),
    "utf8",
  );
  for (const field of [
    "CreateArchiveItem",
    "ListArchiveItems",
    "ListStudentAppTeachingMaterials",
    "ListStudentAppArchiveItems",
    "CreateStudentAppAITutorRequest",
    "ListStudentAppAITutorRequests", "ListStudentAppQuizSubmissions", "ListStudentAppQuestionBankDrafts",
    "CreateQuizSubmission",
    "CreateScannedQuizSubmission",
    "CreateAttendanceSession",
    "SelectAttendanceRandomStudents",
    "AgentAPIKey",
  ]) {
    if (!teachingArchiveServerConfigGo.includes(field)) {
      fail(`Teaching Archive ServerConfig missing field: ${field}`);
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
      fail(`${file} exceeds quality headroom: ${lines} lines > ${maxLines}`);
    }
  }

  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (packageJson.scripts?.quality !== "node tools/quality-gate.mjs") {
    fail("package.json missing strict quality script.");
  }
  if (!packageJson.scripts?.["test:go"]?.includes("./services/teaching-archive-gateway/...")) {
    fail("package.json test:go does not include Teaching Archive Gateway.");
  }
  if (packageJson.scripts?.["test:rust"] !== "cargo test --manifest-path services/agent-harness/Cargo.toml") {
    fail("package.json missing Rust harness test script.");
  }

  console.log("Refactor structure verified.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
