import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = process.cwd();
const required = [
  "docs/development/sdd-tdd.md", "docs/adr/0001-polyglot-boundaries.md",
  "docs/roadmap/refactor-backlog.md", "docs/roadmap/whole-system-module-map.md",
  "contracts/openapi/identity-access.yaml", "contracts/openapi/conversation-write-gateway.yaml",
  "contracts/openapi/teaching-archive.yaml", "contracts/openapi/teaching-archive.archive-items.path.yaml",
  "contracts/openapi/teaching-archive.archive-item-tutoring-analysis-requests.path.yaml", "contracts/openapi/teaching-archive.archive-item-ai-grading-requests.path.yaml",
  "contracts/openapi/teaching-archive.attendance-sessions.path.yaml", "contracts/openapi/teaching-archive.attendance-session-records.path.yaml",
  "contracts/openapi/teaching-archive.student-attendance-records.path.yaml", "contracts/openapi/teaching-archive.attendance-statistics.path.yaml",
  "contracts/openapi/teaching-archive.attendance-session-sign-ins.path.yaml", "contracts/openapi/teaching-archive.attendance-session-end.path.yaml",
  "contracts/openapi/teaching-archive.attendance-session-random-selections.path.yaml", "contracts/openapi/teaching-archive.quiz-submissions.path.yaml",
  "contracts/openapi/teaching-archive.quiz-draft-intents.path.yaml", "contracts/openapi/teaching-archive.archive-material-draft-intents.path.yaml",
  "contracts/openapi/teaching-archive.quiz-scan-submissions.path.yaml", "contracts/openapi/teaching-archive.student-app-teaching-materials.path.yaml",
  "contracts/openapi/teaching-archive.student-app-archive-items.path.yaml", "contracts/openapi/teaching-archive.student-app-archive-item-content-preview.path.yaml", "contracts/openapi/teaching-archive.student-app-archive-item-content-preview-rendered.path.yaml", "contracts/openapi/teaching-archive.student-app-archive-item-study-packet.path.yaml", "contracts/openapi/teaching-archive.student-app-archive-item-learning-actions.path.yaml", "contracts/openapi/teaching-archive.student-app-quiz-submissions.path.yaml", "contracts/openapi/teaching-archive.student-app-quiz-scan-submissions.path.yaml", "contracts/openapi/teaching-archive.student-app-question-bank-drafts.path.yaml", "contracts/openapi/teaching-archive.student-app-question-bank-draft-content.path.yaml", "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submissions.path.yaml", "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-requests.path.yaml", "contracts/openapi/teaching-archive.student-app-question-bank-draft-answer-submission-ai-grading-result.path.yaml", "contracts/openapi/teaching-archive.ai-grading-question-bank-answer-scoring-input.path.yaml", "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
  "contracts/openapi/teaching-archive.quiz-submission-ai-grading-requests.path.yaml", "contracts/openapi/teaching-archive.ai-grading-requests.path.yaml",
  "contracts/openapi/teaching-archive.ai-grading-worker-claims.path.yaml", "contracts/openapi/teaching-archive.ai-grading-worker-result.path.yaml",
  "contracts/openapi/teaching-archive.tutoring-analysis-requests.path.yaml", "contracts/openapi/teaching-archive.tutoring-analysis-worker-claims.path.yaml",
  "contracts/openapi/teaching-archive.tutoring-analysis-worker-result.path.yaml", "contracts/auth/principal-context.schema.json",
  "contracts/auth/access-matrix.json", "contracts/sql/identity-sessions.sql",
  "contracts/sql/teaching-archive.sql", "contracts/harness/permission-manifest.schema.json",
  "contracts/harness/permission-manifest.current.json", "contracts/harness/audit-evidence.schema.json",
  "contracts/harness/audit-evidence.example.json", "contracts/harness/approval-artifact.schema.json",
  "contracts/harness/approval-artifact.example.json", "contracts/harness/approval-decision.schema.json",
  "contracts/harness/approval-decision.example.json", "contracts/harness/approval-decision-correlation.schema.json",
  "contracts/harness/approval-decision-correlation.example.json", "contracts/harness/approval-queue-snapshot.schema.json",
  "contracts/harness/approval-queue-snapshot.example.json", "contracts/harness/execution-candidate-view.schema.json",
  "contracts/harness/execution-candidate-view.example.json", "contracts/harness/rollback-review.schema.json", "contracts/harness/rollback-review.example.json", "contracts/agent/skill-manifest.schema.json",
  "contracts/agent/skill-manifest.examples.json", "contracts/agent/shared-context.schema.json",
  "contracts/agent/shared-context.example.json", "contracts/agent/agent-task.schema.json",
  "contracts/agent/agent-task.example.json", "contracts/agent/agent-route-decision.schema.json",
  "contracts/agent/agent-route-decision.example.json", "contracts/agent/guardrail-result.schema.json",
  "contracts/agent/guardrail-result.example.json", "contracts/agent/skills/search-teaching-material.input.schema.json",
  "contracts/agent/skills/search-teaching-material.output.schema.json", "contracts/agent/skills/search-teaching-material.input.example.json",
  "contracts/agent/skills/search-teaching-material.output.example.json", "contracts/agent/skills/recommend-practice.input.schema.json",
  "contracts/agent/skills/recommend-practice.output.schema.json", "contracts/agent/skills/recommend-practice.input.example.json",
  "contracts/agent/skills/recommend-practice.output.example.json", "contracts/agent/skills/search-knowledge.input.schema.json",
  "contracts/agent/skills/search-knowledge.output.schema.json", "contracts/agent/skills/search-knowledge.input.example.json",
  "contracts/agent/skills/search-knowledge.output.example.json", "contracts/agent/skills/deep-research.input.schema.json",
  "contracts/agent/skills/deep-research.output.schema.json", "contracts/agent/skills/deep-research.input.example.json",
  "contracts/agent/skills/deep-research.output.example.json", "contracts/agent/deep-research-worker-lifecycle.input.schema.json",
  "contracts/agent/deep-research-worker-lifecycle.output.schema.json", "contracts/agent/deep-research-worker-lifecycle.input.example.json",
  "contracts/agent/deep-research-worker-lifecycle.output.example.json", "contracts/agent/deep-research-retrieval-plan.input.schema.json",
  "contracts/agent/deep-research-retrieval-plan.output.schema.json", "contracts/agent/deep-research-retrieval-plan.input.example.json",
  "contracts/agent/deep-research-retrieval-plan.output.example.json", "contracts/agent/deep-research-retrieval-execution.input.schema.json",
  "contracts/agent/deep-research-retrieval-execution.output.schema.json", "contracts/agent/deep-research-retrieval-execution.input.example.json",
  "contracts/agent/deep-research-retrieval-execution.output.example.json", "contracts/agent/deep-research-reasoning-synthesis.input.schema.json",
  "contracts/agent/deep-research-reasoning-synthesis.output.schema.json", "contracts/agent/deep-research-reasoning-synthesis.input.example.json",
  "contracts/agent/deep-research-reasoning-synthesis.output.example.json", "contracts/agent/deep-research-final-answer-review.input.schema.json",
  "contracts/agent/deep-research-final-answer-review.output.schema.json", "contracts/agent/deep-research-final-answer-review.input.example.json",
  "contracts/agent/deep-research-final-answer-review.output.example.json", "contracts/agent/deep-research-finalization.input.schema.json",
  "contracts/agent/deep-research-finalization.output.schema.json", "contracts/agent/deep-research-finalization.input.example.json",
  "contracts/agent/deep-research-finalization.output.example.json", "contracts/agent/deep-research-render-preview.input.schema.json",
  "contracts/agent/deep-research-render-preview.output.schema.json", "contracts/agent/deep-research-render-preview.input.example.json",
  "contracts/agent/deep-research-render-preview.output.example.json", "contracts/agent/deep-research-publication-precheck.input.schema.json",
  "contracts/agent/deep-research-publication-precheck.output.schema.json", "contracts/agent/deep-research-publication-precheck.input.example.json",
  "contracts/agent/deep-research-publication-precheck.output.example.json", "contracts/agent/deep-research-teacher-delivery.input.schema.json",
  "contracts/agent/deep-research-teacher-delivery.output.schema.json", "contracts/agent/deep-research-teacher-delivery.input.example.json",
  "contracts/agent/deep-research-teacher-delivery.output.example.json", "contracts/agent/deep-research-student-visibility-review.input.schema.json",
  "contracts/agent/deep-research-student-visibility-review.output.schema.json", "contracts/agent/deep-research-student-visibility-review.input.example.json",
  "contracts/agent/deep-research-student-visibility-review.output.example.json", "contracts/agent/deep-research-student-delivery.input.schema.json",
  "contracts/agent/deep-research-student-delivery.output.schema.json", "contracts/agent/deep-research-student-delivery.input.example.json",
  "contracts/agent/deep-research-student-delivery.output.example.json", "contracts/agent/deep-research-student-archive-persistence.input.schema.json",
  "contracts/agent/deep-research-student-archive-persistence.output.schema.json", "contracts/agent/deep-research-student-archive-persistence.input.example.json",
  "contracts/agent/deep-research-student-archive-persistence.output.example.json", "contracts/agent/deep-research-student-archive-projection-review.input.schema.json",
  "contracts/agent/deep-research-student-archive-projection-review.output.schema.json", "contracts/agent/deep-research-student-archive-projection-review.input.example.json",
  "contracts/agent/deep-research-student-archive-projection-review.output.example.json", "contracts/agent/deep-research-student-archive-projection.input.schema.json",
  "contracts/agent/deep-research-student-archive-projection.output.schema.json", "contracts/agent/deep-research-student-archive-projection.input.example.json",
  "contracts/agent/deep-research-student-archive-projection.output.example.json", "contracts/agent/deep-research-student-archive-storage-precommit.input.schema.json",
  "contracts/agent/deep-research-student-archive-storage-precommit.output.schema.json", "contracts/agent/deep-research-student-archive-storage-precommit.input.example.json",
  "contracts/agent/deep-research-student-archive-storage-precommit.output.example.json", "contracts/agent/deep-research-student-archive-storage-commit.input.schema.json",
  "contracts/agent/deep-research-student-archive-storage-commit.output.schema.json", "contracts/agent/deep-research-student-archive-storage-commit.input.example.json",
  "contracts/agent/deep-research-student-archive-storage-commit.output.example.json", "contracts/agent/deep-research-student-archive-row-verification.input.schema.json",
  "contracts/agent/deep-research-student-archive-row-verification.output.schema.json", "contracts/agent/deep-research-student-archive-row-verification.input.example.json",
  "contracts/agent/deep-research-student-archive-row-verification.output.example.json", "contracts/agent/student-app-ai-tutor-request.input.schema.json",
  "contracts/agent/student-app-ai-tutor-request.output.schema.json", "contracts/agent/student-app-ai-tutor-request.input.example.json",
  "contracts/agent/student-app-ai-tutor-request.output.example.json", "contracts/agent/student-app-ai-tutor-worker-claim.input.schema.json",
  "contracts/agent/student-app-ai-tutor-worker-claim.output.schema.json", "contracts/agent/student-app-ai-tutor-worker-claim.input.example.json",
  "contracts/agent/student-app-ai-tutor-worker-claim.output.example.json", "contracts/agent/student-app-ai-tutor-result.input.schema.json",
  "contracts/agent/student-app-ai-tutor-result.output.schema.json", "contracts/agent/student-app-ai-tutor-result.input.example.json",
  "contracts/agent/student-app-ai-tutor-result.output.example.json", "contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.input.schema.json",
  "contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.output.schema.json", "contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.input.example.json",
  "contracts/agent/student-app-ai-tutor-question-bank-draft-visibility.output.example.json", "contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.input.schema.json",
  "contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.output.schema.json", "contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.input.example.json",
  "contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.output.example.json", "contracts/agent/teaching-agent-readonly-adapter.schema.json",
  "contracts/agent/teaching-agent-readonly-adapter.example.json", "contracts/agent/student-tutor-agent-readonly-adapter.schema.json",
  "contracts/agent/student-tutor-agent-readonly-adapter.example.json", "contracts/agent/research-agent-readonly-adapter.schema.json",
  "contracts/agent/research-agent-readonly-adapter.example.json", "contracts/agent/readonly-runtime-dispatcher.schema.json",
  "contracts/agent/readonly-runtime-dispatcher.example.json", "contracts/agent/controlled-write-intent-gateway.schema.json",
  "contracts/agent/controlled-write-intent-gateway.example.json", "contracts/workflow/workflow-plugin-draft.schema.json",
  "contracts/workflow/workflow-plugin-sandbox-run.schema.json", "contracts/workflow/workflow-plugin-approval.schema.json",
  "contracts/workflow/workflow-plugin-registry-entry.schema.json", "contracts/workflow/workflow-plugin-registry-admission.schema.json",
  "contracts/workflow/workflow-plugin-execution-isolation-policy.schema.json", "contracts/workflow/workflow-plugin-publication-policy.schema.json",
  "contracts/workflow/workflow-plugin-management-disabled-view.schema.json", "contracts/workflow/workflow-plugin-management-audit-detail.schema.json",
  "contracts/workflow/workflow-plugin-management-readonly-list.schema.json", "contracts/workflow/workflow-plugin-revision-request.schema.json",
  "contracts/workflow/workflow-draft.example.json", "contracts/workflow/plugin-draft.example.json",
  "contracts/workflow/workflow-plugin-sandbox-run.example.json", "contracts/workflow/workflow-plugin-approval.example.json",
  "contracts/workflow/workflow-plugin-registry-entry.example.json", "contracts/workflow/workflow-plugin-registry-admission.example.json",
  "contracts/workflow/workflow-plugin-execution-isolation-policy.example.json", "contracts/workflow/workflow-plugin-publication-policy.example.json",
  "contracts/workflow/workflow-plugin-management-disabled-view.example.json", "contracts/workflow/workflow-plugin-management-audit-detail.example.json",
  "contracts/workflow/workflow-plugin-management-readonly-list.example.json", "contracts/workflow/workflow-plugin-revision-request.example.json",
  "contracts/ai-worker/ai-worker-job.schema.json", "contracts/ai-worker/ai-worker-result.schema.json",
  "contracts/ai-worker/ai-worker-job.examples.json", "contracts/ai-worker/ai-worker-result.example.json",
  "contracts/ai-worker/ai-worker-admission.schema.json", "contracts/ai-worker/ai-worker-admission.example.json",
  "contracts/ai-worker/ai-worker-runtime-dependency-profile.schema.json", "contracts/ai-worker/ai-worker-runtime-dependency-profile.current.json",
  "contracts/ops/performance-evidence-registry.schema.json", "contracts/ops/performance-evidence-registry.current.json",
  "contracts/knowledge/knowledge-access-policy.schema.json", "contracts/knowledge/knowledge-access-policy.current.json",
  "contracts/knowledge/knowledge-retrieval-benchmark.schema.json", "contracts/knowledge/knowledge-retrieval-benchmark.current.json",
  "contracts/events/research-events.schema.json", "contracts/config/connection-budget.schema.json",
  "contracts/config/connection-budget.current.json", "contracts/config/connection-budget.current-audited-worst-case.json",
  "contracts/config/connection-budget.proposed-direct-limited.json", "contracts/config/connection-budget.proposed-pgbouncer-transaction.json",
  "contracts/config/legacy-db-pool-audit.schema.json", "contracts/config/legacy-db-pool-remediation.schema.json",
  "contracts/config/pgbouncer-perf-profile.schema.json", "contracts/config/pgbouncer-perf-profile.current.json",
  "contracts/config/pgbouncer-perf-profile.proposed.json", "infra/perf/docker-compose.pgbouncer.override.yml",
  "infra/perf/docker-compose.identity-session.yml", "infra/perf/identity-session-pgbouncer.ini",
  "infra/perf/identity-session-userlist.txt", "services/conversation-write-gateway/go.mod",
  "services/identity-access-gateway/go.mod", "services/teaching-archive-gateway/go.mod",
  "services/teaching-archive-gateway/go.sum", "services/teaching-archive-gateway/cmd/gateway/main.go",
  "services/teaching-archive-gateway/internal/domain/archive.go", "services/teaching-archive-gateway/internal/domain/student_app_teaching_materials.go", "services/teaching-archive-gateway/internal/domain/student_app_teaching_materials_test.go", "services/teaching-archive-gateway/internal/domain/student_app_archive_items.go", "services/teaching-archive-gateway/internal/domain/student_app_archive_items_test.go", "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go", "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_test.go", "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests.go", "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_requests_test.go", "services/teaching-archive-gateway/internal/domain/student_app_quiz_submissions.go", "services/teaching-archive-gateway/internal/domain/student_app_quiz_submissions_test.go", "services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts.go", "services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts_test.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_content.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_content_test.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_submission.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_submission_test.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_request.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_request_test.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_input.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_input_test.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_result.go", "services/teaching-archive-gateway/internal/domain/question_bank_draft_answer_scoring_result_test.go", "services/teaching-archive-gateway/internal/domain/quiz_submission.go",
  "services/teaching-archive-gateway/internal/domain/quiz_submission_test.go", "services/teaching-archive-gateway/internal/domain/teaching_quiz_draft_intent.go",
  "services/teaching-archive-gateway/internal/domain/teaching_quiz_draft_intent_test.go", "services/teaching-archive-gateway/internal/domain/teaching_archive_material_draft_intent.go",
  "services/teaching-archive-gateway/internal/domain/teaching_archive_material_draft_intent_test.go", "services/teaching-archive-gateway/internal/domain/quiz_scan_submission.go",
  "services/teaching-archive-gateway/internal/domain/quiz_scan_submission_test.go", "services/teaching-archive-gateway/internal/domain/quiz_submission_query.go",
  "services/teaching-archive-gateway/internal/domain/quiz_submission_query_test.go", "services/teaching-archive-gateway/internal/domain/ai_grading_request.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_request_test.go", "services/teaching-archive-gateway/internal/domain/ai_grading_query.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_claim.go", "services/teaching-archive-gateway/internal/domain/ai_grading_claim_test.go",
  "services/teaching-archive-gateway/internal/domain/ai_grading_result.go", "services/teaching-archive-gateway/internal/domain/ai_grading_result_test.go",
  "services/teaching-archive-gateway/internal/domain/archive_query.go", "services/teaching-archive-gateway/internal/domain/attendance_record.go",
  "services/teaching-archive-gateway/internal/domain/attendance_record_test.go", "services/teaching-archive-gateway/internal/domain/attendance_record_query.go",
  "services/teaching-archive-gateway/internal/domain/attendance_record_query_test.go", "services/teaching-archive-gateway/internal/domain/student_attendance_record_query.go",
  "services/teaching-archive-gateway/internal/domain/student_attendance_record_query_test.go", "services/teaching-archive-gateway/internal/domain/attendance_statistics.go",
  "services/teaching-archive-gateway/internal/domain/attendance_statistics_test.go", "services/teaching-archive-gateway/internal/domain/attendance_sign_in.go",
  "services/teaching-archive-gateway/internal/domain/attendance_sign_in_test.go", "services/teaching-archive-gateway/internal/domain/attendance_session_end.go",
  "services/teaching-archive-gateway/internal/domain/attendance_session_end_test.go", "services/teaching-archive-gateway/internal/domain/attendance_random_selection.go",
  "services/teaching-archive-gateway/internal/domain/attendance_random_selection_test.go", "services/teaching-archive-gateway/internal/domain/principal.go",
  "services/teaching-archive-gateway/internal/domain/tutoring_analysis_query.go", "services/teaching-archive-gateway/internal/domain/tutoring_analysis_claim.go",
  "services/teaching-archive-gateway/internal/domain/tutoring_analysis_claim_test.go", "services/teaching-archive-gateway/internal/domain/tutoring_analysis_result.go",
  "services/teaching-archive-gateway/internal/domain/archive_authorization_test.go", "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_archive_item.go", "services/teaching-archive-gateway/internal/usecase/create_archive_item_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_quiz_submission.go", "services/teaching-archive-gateway/internal/usecase/create_quiz_submission_test.go",
  "services/teaching-archive-gateway/internal/usecase/submit_teaching_quiz_draft_intent.go", "services/teaching-archive-gateway/internal/usecase/submit_teaching_quiz_draft_intent_test.go",
  "services/teaching-archive-gateway/internal/usecase/submit_teaching_archive_material_draft_intent.go", "services/teaching-archive-gateway/internal/usecase/submit_teaching_archive_material_draft_intent_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_scanned_quiz_submission.go", "services/teaching-archive-gateway/internal/usecase/create_scanned_quiz_submission_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_quiz_submissions.go", "services/teaching-archive-gateway/internal/usecase/list_quiz_submissions_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_ai_grading_request.go", "services/teaching-archive-gateway/internal/usecase/create_ai_grading_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_quiz_submission_ai_grading_request.go", "services/teaching-archive-gateway/internal/usecase/create_quiz_submission_ai_grading_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_attendance_session.go", "services/teaching-archive-gateway/internal/usecase/create_attendance_session_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_attendance_record.go", "services/teaching-archive-gateway/internal/usecase/create_attendance_record_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_attendance_records.go", "services/teaching-archive-gateway/internal/usecase/list_attendance_records_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_student_attendance_records.go", "services/teaching-archive-gateway/internal/usecase/list_student_attendance_records_test.go",
  "services/teaching-archive-gateway/internal/usecase/get_attendance_statistics.go", "services/teaching-archive-gateway/internal/usecase/get_attendance_statistics_test.go",
  "services/teaching-archive-gateway/internal/usecase/sign_in_attendance.go", "services/teaching-archive-gateway/internal/usecase/sign_in_attendance_test.go",
  "services/teaching-archive-gateway/internal/usecase/end_attendance_session.go", "services/teaching-archive-gateway/internal/usecase/end_attendance_session_test.go",
  "services/teaching-archive-gateway/internal/usecase/select_attendance_random_students.go", "services/teaching-archive-gateway/internal/usecase/select_attendance_random_students_test.go",
  "services/teaching-archive-gateway/internal/usecase/list_ai_grading_requests.go", "services/teaching-archive-gateway/internal/usecase/list_ai_grading_requests_test.go",
  "services/teaching-archive-gateway/internal/usecase/claim_ai_grading_request.go", "services/teaching-archive-gateway/internal/usecase/claim_ai_grading_request_test.go",
  "services/teaching-archive-gateway/internal/usecase/record_ai_grading_result.go", "services/teaching-archive-gateway/internal/usecase/record_ai_grading_result_test.go",
  "services/teaching-archive-gateway/internal/usecase/create_tutoring_analysis_request_test.go", "services/teaching-archive-gateway/internal/usecase/list_archive_items.go",
  "services/teaching-archive-gateway/internal/usecase/list_archive_items_test.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_teaching_materials.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_teaching_materials_test.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_archive_items_test.go", "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go", "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_ai_tutor_requests_test.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_quiz_submissions.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_quiz_submissions_test.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts.go", "services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts_test.go", "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_content.go", "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_content_test.go", "services/teaching-archive-gateway/internal/usecase/submit_student_app_question_bank_draft_answer.go", "services/teaching-archive-gateway/internal/usecase/submit_student_app_question_bank_draft_answer_test.go", "services/teaching-archive-gateway/internal/usecase/create_student_app_question_bank_draft_answer_scoring_request.go", "services/teaching-archive-gateway/internal/usecase/create_student_app_question_bank_draft_answer_scoring_request_test.go", "services/teaching-archive-gateway/internal/usecase/read_question_bank_draft_answer_scoring_input.go", "services/teaching-archive-gateway/internal/usecase/read_question_bank_draft_answer_scoring_input_test.go", "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_answer_scoring_result.go", "services/teaching-archive-gateway/internal/usecase/read_student_app_question_bank_draft_answer_scoring_result_test.go", "services/teaching-archive-gateway/internal/usecase/list_tutoring_analysis_requests.go",
  "services/teaching-archive-gateway/internal/usecase/list_tutoring_analysis_requests_test.go", "services/teaching-archive-gateway/internal/usecase/claim_tutoring_analysis_request.go",
  "services/teaching-archive-gateway/internal/usecase/claim_tutoring_analysis_request_test.go", "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result.go",
  "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result_test.go", "services/teaching-archive-gateway/internal/usecase/principal_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_config.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_routes.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_archive_items.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_teaching_materials.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_teaching_materials_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_items_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_requests_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_submissions.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_submissions_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_scan_submission.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_quiz_scan_submission_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_content.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_content_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_submission_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_question_bank_answer_scoring_input_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_draft_answer_scoring_completion_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_record.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_record_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_record_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_attendance_record.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_attendance_record_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_statistics.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_statistics_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_sign_in.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_sign_in_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_session_end.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_session_end_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_random_selection.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_attendance_random_selection_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_request_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_query.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_query_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_claim.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_claim_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_ai_grading_result_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_submission_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_draft_intent.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_draft_intent_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_archive_material_draft_intent.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_archive_material_draft_intent_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_scan_submission.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_scan_submission_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_quiz_submission_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_test_helpers_test.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_requests.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_paths.go", "services/teaching-archive-gateway/internal/adapter/httpapi/server_codec.go",
  "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_items_get_by_id_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission_query.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_quiz_submission_query_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_student_app_request_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_content_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_question_bank_draft_answer_submission_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_record.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_record_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_record_query.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_record_query_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_student_attendance_record_query.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_student_attendance_record_query_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_statistics.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_statistics_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_session_end.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_session_end_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_random_selection.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_attendance_random_selection_test.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_request.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_helpers.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_query_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_claim.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_claim_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_grading_result.go", "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
  "services/teaching-archive-gateway/internal/adapter/postgres/pool_db.go", "services/teaching-archive-gateway/internal/platform/runtime.go",
  "services/teaching-archive-gateway/internal/adapter/commandlog/quiz_draft_intent.go", "services/teaching-archive-gateway/internal/adapter/commandlog/archive_material_draft_intent.go",
  "services/teaching-archive-gateway/internal/adapter/commandlog/repository_test.go", "tools/identity-session-runtime-profile-audit.mjs",
  "tools/run-identity-session-integration.mjs", "tools/run-identity-session-benchmark.mjs",
  "tools/identity-session-benchmark-summary.mjs", "services/identity-access-gateway/cmd/sessionbench/main.go",
  "tools/run-identity-http-benchmark.mjs", "tools/run-identity-http-benchmark.test.mjs",
  "tools/run-identity-phase-matrix.mjs", "tools/run-identity-phase-matrix.test.mjs",
  "services/identity-access-gateway/cmd/httpbench/main.go", "docs/sdd/0147-identity-revoke-cycle-latency-attribution.md",
  "docs/sdd/0148-identity-apply-pgbouncer-headroom-runtime.md", "docs/sdd/0149-identity-ingress-preconnect-retry.md",
  "docs/sdd/0150-identity-current-source-evidence-promotion.md", "docs/sdd/0151-identity-batched-token-issuance.md",
  "docs/sdd/0152-identity-session-operation-timing-diagnostics.md", "docs/sdd/0153-identity-phase-gateway-db-diagnostics.md",
  "docs/sdd/0154-identity-phase-aware-matrix-runner.md", "docs/sdd/0155-identity-4400-phase-matrix-headroom-candidate.md",
  "docs/sdd/0156-system-mixed-workload-identity-ingress-profile.md", "docs/sdd/0228-workflow-plugin-draft-command-intent-runtime.md",
  "docs/sdd/0229-workflow-plugin-sandbox-result-runtime.md", "docs/sdd/0230-workflow-plugin-human-approval-runtime.md",
  "docs/sdd/0231-workflow-plugin-registry-admission-runtime.md", "docs/sdd/0232-workflow-plugin-execution-isolation-precheck.md",
  "docs/sdd/0233-workflow-plugin-publication-disabled-gate.md", "docs/sdd/0234-workflow-plugin-management-disabled-view.md",
  "docs/sdd/0235-workflow-plugin-management-audit-detail.md", "docs/sdd/0236-workflow-plugin-management-readonly-list.md",
  "docs/sdd/0237-teaching-agent-readonly-runtime-adapter.md", "docs/sdd/0238-agent-readonly-runtime-dispatcher-invocation.md",
  "docs/sdd/0239-student-tutor-agent-readonly-runtime-adapter.md", "docs/sdd/0240-research-agent-readonly-runtime-adapter.md",
  "docs/sdd/0241-agent-readonly-api-runtime.md", "docs/sdd/0242-research-deep-research-intent-runtime.md",
  "docs/sdd/0243-research-deep-research-worker-lifecycle.md", "docs/sdd/0244-research-deep-research-retrieval-plan.md",
  "docs/sdd/0245-research-deep-research-retrieval-execution.md", "docs/sdd/0246-research-deep-research-reasoning-synthesis.md",
  "docs/sdd/0247-research-deep-research-final-answer-review.md", "docs/sdd/0248-research-deep-research-finalization-runtime.md",
  "docs/sdd/0249-research-deep-research-render-preview-runtime.md", "docs/sdd/0250-research-deep-research-publication-precheck-runtime.md",
  "docs/sdd/0251-research-deep-research-teacher-delivery-runtime.md", "docs/sdd/0252-research-deep-research-student-visibility-review-runtime.md",
  "docs/sdd/0253-research-deep-research-student-delivery-runtime.md", "docs/sdd/0254-research-deep-research-student-archive-persistence-runtime.md",
  "docs/sdd/0255-research-deep-research-student-archive-projection-review-runtime.md", "docs/sdd/0256-research-deep-research-student-archive-projection-runtime.md",
  "docs/sdd/0257-research-deep-research-student-archive-storage-precommit-runtime.md", "docs/sdd/0258-research-deep-research-student-archive-storage-commit-runtime.md",
  "docs/sdd/0259-research-deep-research-student-archive-row-verification-runtime.md", "docs/sdd/0260-student-app-ai-tutor-request-runtime.md",
  "docs/sdd/0261-student-app-ai-tutor-worker-claim-runtime.md", "docs/sdd/0262-student-app-ai-tutor-result-runtime.md",
  "docs/sdd/0263-student-app-ai-tutor-question-bank-draft-visibility-runtime.md", "docs/sdd/0264-student-app-ai-tutor-question-bank-draft-content-precheck-runtime.md", "docs/sdd/0265-student-app-ai-tutor-question-bank-draft-content-read-foundation.md", "docs/sdd/0266-student-app-ai-tutor-question-bank-draft-answer-submission-foundation.md", "docs/sdd/0267-student-app-ai-tutor-question-bank-draft-answer-scoring-request-foundation.md", "docs/sdd/0268-student-app-ai-tutor-question-bank-draft-answer-scoring-input-foundation.md", "docs/sdd/0269-student-app-ai-tutor-question-bank-draft-answer-scoring-result-foundation.md", "docs/sdd/0270-student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge.md",
  "docs/sdd/0271-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck.md", "docs/sdd/0272-student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact.md",
  "docs/sdd/0273-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval.md", "docs/sdd/0274-student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope.md",
  "docs/sdd/0275-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command.md", "docs/sdd/0276-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit.md", "docs/sdd/0277-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification.md", "docs/sdd/0278-student-app-ai-tutor-question-bank-draft-generation-plan.md",
  "docs/sdd/0279-student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck.md", "docs/sdd/0280-student-app-ai-tutor-question-bank-draft-generation-worker-claim.md",
  "docs/sdd/0281-student-app-ai-tutor-question-bank-draft-generation-input-envelope.md", "docs/sdd/0282-student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.md",
  "docs/sdd/0283-student-app-ai-tutor-question-bank-draft-generation-controlled-draft.md", "docs/sdd/0284-student-app-ai-tutor-question-bank-draft-generation-teacher-review.md",
  "docs/sdd/0285-student-app-ai-tutor-question-bank-draft-generation-content-storage-commit.md", "docs/sdd/0286-student-app-ai-tutor-question-bank-draft-generation-content-row-verification.md",
  "docs/sdd/0287-student-app-ai-tutor-question-bank-draft-content-student-read-verification.md", "docs/sdd/0288-student-app-ai-tutor-question-bank-draft-answer-submission-verification.md",
  "docs/sdd/0289-student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification.md", "docs/sdd/0290-student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck.md",
  "docs/sdd/0291-student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.md", "docs/sdd/0292-student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.md",
  "docs/sdd/0293-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-persisted-scoring-source.md", "docs/sdd/0294-student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck.md", "docs/sdd/0295-student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft.md", "docs/sdd/0296-student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source.md", "docs/sdd/0297-student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source.md", "docs/sdd/0298-student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source.md", "docs/sdd/0299-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source.md", "docs/sdd/0300-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source.md", "docs/sdd/0301-student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source.md", "tools/quality-gate.mjs",
  "tools/quality-gate-report-state.mjs", "tools/quality-gate.test.mjs", "tools/pgbouncer-perf-profile-audit.mjs", "tools/pgbouncer-perf-profile-audit.test.mjs", "tools/student-app-flow-audit.mjs", "tools/student-app-flow-audit.test.mjs", "tools/agent-harness-flow-audit.mjs", "tools/agent-harness-flow-audit.test.mjs", "tools/agent-skill-contract-audit.mjs", "tools/agent-skill-contract-audit.test.mjs", "tools/agent-readonly-runtime-dispatcher-audit.mjs", "tools/agent-readonly-runtime-dispatcher-audit.test.mjs", "tools/agent-controlled-write-intent-gateway-audit.mjs", "tools/agent-controlled-write-intent-gateway-audit.test.mjs", "tools/teaching-agent-readonly-runtime-slo-audit.mjs", "tools/teaching-agent-readonly-runtime-slo-audit.test.mjs", "tools/student-tutor-agent-readonly-contract-audit.mjs", "tools/student-tutor-agent-readonly-contract-audit.test.mjs", "tools/student-tutor-agent-readonly-runtime-slo-audit.mjs", "tools/student-tutor-agent-readonly-runtime-slo-audit.test.mjs", "tools/research-agent-readonly-contract-audit.mjs", "tools/research-agent-readonly-contract-audit.test.mjs", "tools/research-agent-readonly-runtime-slo-audit.mjs", "tools/research-agent-readonly-runtime-slo-audit.test.mjs", "tools/workflow-plugin-flow-audit.mjs", "tools/workflow-plugin-flow-audit.test.mjs", "tools/workflow-plugin-registry-admission.mjs", "tools/workflow-plugin-registry-admission.test.mjs", "tools/workflow-plugin-revision-feedback.mjs", "tools/workflow-plugin-revision-feedback.test.mjs", "tools/workflow-plugin-runtime-slo-audit.mjs", "tools/workflow-plugin-runtime-slo-audit.test.mjs", "tools/workflow-plugin-draft-intent-runtime.mjs", "tools/workflow-plugin-draft-intent-runtime.test.mjs", "tools/workflow-plugin-draft-intent-audit.mjs", "tools/workflow-plugin-draft-intent-audit.test.mjs", "tools/workflow-plugin-sandbox-result-runtime.mjs", "tools/workflow-plugin-sandbox-result-runtime.test.mjs", "tools/workflow-plugin-sandbox-result-audit.mjs", "tools/workflow-plugin-sandbox-result-audit.test.mjs", "tools/workflow-plugin-human-approval-runtime.mjs", "tools/workflow-plugin-human-approval-runtime.test.mjs", "tools/workflow-plugin-human-approval-audit.mjs", "tools/workflow-plugin-human-approval-audit.test.mjs", "tools/workflow-plugin-registry-admission-runtime.mjs", "tools/workflow-plugin-registry-admission-runtime.test.mjs", "tools/workflow-plugin-registry-admission-runtime-audit.mjs", "tools/workflow-plugin-registry-admission-runtime-audit.test.mjs", "tools/ai-worker-job-audit.mjs", "tools/ai-worker-job-audit.test.mjs", "tools/knowledge-access-policy-audit.mjs", "tools/knowledge-access-policy-audit.test.mjs", "tools/ai-worker-job-admission.mjs", "tools/ai-worker-job-admission.test.mjs", "tools/knowledge-retrieval-benchmark-audit.mjs", "tools/knowledge-retrieval-benchmark-audit.test.mjs", "tools/ai-worker-runtime-dependency-profile-audit.mjs", "tools/ai-worker-runtime-dependency-profile-audit.test.mjs", "tools/performance-evidence-registry-audit.mjs", "tools/performance-evidence-registry-audit.test.mjs", "tools/verify-structure-sdd-discovery.test.mjs", "tools/teaching-quiz-draft-intent-audit.mjs", "tools/teaching-quiz-draft-intent-audit.test.mjs", "tools/teaching-archive-material-draft-intent-audit.mjs", "tools/teaching-archive-material-draft-intent-audit.test.mjs", "services/identity-access-gateway/internal/adapter/bootstrap/wechat_authenticator.go", "services/identity-access-gateway/internal/domain/student_app_profile.go", "services/identity-access-gateway/internal/domain/student_app_profile_test.go", "services/identity-access-gateway/internal/usecase/student_app_profile.go", "services/identity-access-gateway/internal/usecase/student_app_profile_test.go", "services/identity-access-gateway/internal/adapter/httpapi/server_student_app_profile.go", "services/identity-access-gateway/internal/adapter/httpapi/server_student_app_profile_test.go", "services/agent-harness/Cargo.toml",
  "services/agent-harness/Cargo.lock", "services/agent-harness/src/lib.rs",
  "services/agent-harness/src/approval_decision.rs", "services/agent-harness/src/approval_correlation.rs",
  "services/agent-harness/src/approval_queue.rs", "services/agent-harness/src/execution_candidate.rs", "services/agent-harness/src/rollback_review.rs", "services/agent-harness/tests/permission_manifest.rs",
  "services/agent-harness/tests/audit_evidence.rs", "services/agent-harness/tests/dry_run_harness.rs",
  "services/agent-harness/tests/jsonl_evidence_store.rs", "services/agent-harness/tests/filesystem_metadata_dry_run.rs",
  "services/agent-harness/tests/persistent_dry_run_evidence.rs", "services/agent-harness/tests/persistent_filesystem_metadata_dry_run.rs",
  "services/agent-harness/tests/approval_artifact.rs", "services/agent-harness/tests/approval_decision.rs",
  "services/agent-harness/tests/approval_decision_correlation.rs", "services/agent-harness/tests/approval_queue_reader.rs",
  "services/agent-harness/tests/execution_candidate_view.rs", "services/agent-harness/tests/rollback_review.rs", "tools/workflow-plugin-execution-isolation-runtime.mjs",
  "tools/workflow-plugin-execution-isolation-runtime.test.mjs", "tools/workflow-plugin-execution-isolation-audit.mjs",
  "tools/workflow-plugin-execution-isolation-audit.test.mjs", "tools/workflow-plugin-publication-disabled-runtime.mjs",
  "tools/workflow-plugin-publication-disabled-runtime.test.mjs", "tools/workflow-plugin-publication-disabled-audit.mjs",
  "tools/workflow-plugin-publication-disabled-audit.test.mjs", "tools/workflow-plugin-management-disabled-view-runtime.mjs",
  "tools/workflow-plugin-management-disabled-view-runtime.test.mjs", "tools/workflow-plugin-management-disabled-view-audit.mjs",
  "tools/workflow-plugin-management-disabled-view-audit.test.mjs", "tools/workflow-plugin-management-audit-detail-runtime.mjs",
  "tools/workflow-plugin-management-audit-detail-runtime.test.mjs", "tools/workflow-plugin-management-audit-detail-audit.mjs",
  "tools/workflow-plugin-management-audit-detail-audit.test.mjs", "tools/workflow-plugin-management-readonly-list-runtime.mjs",
  "tools/workflow-plugin-management-readonly-list-runtime.test.mjs", "tools/workflow-plugin-management-readonly-list-audit.mjs",
  "tools/workflow-plugin-management-readonly-list-audit.test.mjs", "tools/agent-readonly-runtime-dispatcher.mjs",
  "tools/agent-readonly-runtime-dispatcher.test.mjs", "tools/agent-readonly-runtime-dispatcher-audit-probes.mjs",
  "tools/agent-readonly-api-runtime.mjs", "tools/agent-readonly-api-runtime.test.mjs",
  "tools/agent-readonly-api-runtime-audit.mjs", "tools/agent-readonly-api-runtime-audit.test.mjs",
  "tools/teaching-agent-readonly-runtime-adapter.mjs", "tools/teaching-agent-readonly-runtime-adapter.test.mjs",
  "tools/teaching-agent-readonly-runtime-adapter-audit.mjs", "tools/teaching-agent-readonly-runtime-adapter-audit.test.mjs",
  "tools/student-tutor-agent-readonly-runtime-adapter.mjs", "tools/student-tutor-agent-readonly-runtime-adapter.test.mjs",
  "tools/student-tutor-agent-readonly-runtime-adapter-audit.mjs", "tools/student-tutor-agent-readonly-runtime-adapter-audit.test.mjs",
  "tools/research-agent-readonly-runtime-adapter.mjs", "tools/research-agent-readonly-runtime-adapter.test.mjs",
  "tools/research-agent-readonly-runtime-adapter-audit.mjs", "tools/research-agent-readonly-runtime-adapter-audit.test.mjs",
  "tools/research-deep-research-intent-runtime.mjs", "tools/research-deep-research-intent-runtime.test.mjs",
  "tools/research-deep-research-intent-audit.mjs", "tools/research-deep-research-intent-audit.test.mjs",
  "tools/research-deep-research-worker-lifecycle-runtime.mjs", "tools/research-deep-research-worker-lifecycle-runtime.test.mjs",
  "tools/research-deep-research-worker-lifecycle-audit.mjs", "tools/research-deep-research-worker-lifecycle-audit.test.mjs",
  "tools/research-deep-research-retrieval-plan-runtime.mjs", "tools/research-deep-research-retrieval-plan-runtime.test.mjs",
  "tools/research-deep-research-retrieval-plan-audit.mjs", "tools/research-deep-research-retrieval-plan-audit.test.mjs",
  "tools/research-deep-research-retrieval-execution-runtime.mjs", "tools/research-deep-research-retrieval-execution-runtime.test.mjs",
  "tools/research-deep-research-retrieval-execution-audit.mjs", "tools/research-deep-research-retrieval-execution-audit.test.mjs",
  "tools/research-deep-research-reasoning-synthesis-runtime.mjs", "tools/research-deep-research-reasoning-synthesis-runtime.test.mjs",
  "tools/research-deep-research-reasoning-synthesis-audit.mjs", "tools/research-deep-research-reasoning-synthesis-audit.test.mjs",
  "tools/research-deep-research-final-answer-review-runtime.mjs", "tools/research-deep-research-final-answer-review-runtime.test.mjs",
  "tools/research-deep-research-final-answer-review-audit.mjs", "tools/research-deep-research-final-answer-review-audit.test.mjs",
  "tools/research-deep-research-finalization-runtime.mjs", "tools/research-deep-research-finalization-runtime.test.mjs",
  "tools/research-deep-research-finalization-audit.mjs", "tools/research-deep-research-finalization-audit.test.mjs",
  "tools/research-deep-research-render-preview-runtime.mjs", "tools/research-deep-research-render-preview-runtime.test.mjs",
  "tools/research-deep-research-render-preview-audit.mjs", "tools/research-deep-research-render-preview-audit.test.mjs",
  "tools/research-deep-research-publication-precheck-runtime.mjs", "tools/research-deep-research-publication-precheck-runtime.test.mjs",
  "tools/research-deep-research-publication-precheck-audit.mjs", "tools/research-deep-research-publication-precheck-audit.test.mjs",
  "tools/research-deep-research-teacher-delivery-runtime.mjs", "tools/research-deep-research-teacher-delivery-runtime.test.mjs",
  "tools/research-deep-research-teacher-delivery-audit.mjs", "tools/research-deep-research-teacher-delivery-audit.test.mjs",
  "tools/research-deep-research-student-visibility-review-runtime.mjs", "tools/research-deep-research-student-visibility-review-runtime.test.mjs",
  "tools/research-deep-research-student-visibility-review-audit.mjs", "tools/research-deep-research-student-visibility-review-audit.test.mjs",
  "tools/research-deep-research-student-delivery-runtime.mjs", "tools/research-deep-research-student-delivery-runtime.test.mjs",
  "tools/research-deep-research-student-delivery-audit.mjs", "tools/research-deep-research-student-delivery-audit.test.mjs",
  "tools/research-deep-research-student-archive-persistence-runtime.mjs", "tools/research-deep-research-student-archive-persistence-runtime.test.mjs",
  "tools/research-deep-research-student-archive-persistence-audit.mjs", "tools/research-deep-research-student-archive-persistence-audit.test.mjs",
  "tools/research-deep-research-student-archive-projection-review-runtime.mjs", "tools/research-deep-research-student-archive-projection-review-runtime.test.mjs",
  "tools/research-deep-research-student-archive-projection-review-audit.mjs", "tools/research-deep-research-student-archive-projection-review-audit.test.mjs",
  "tools/research-deep-research-student-archive-projection-runtime.mjs", "tools/research-deep-research-student-archive-projection-runtime.test.mjs",
  "tools/research-deep-research-student-archive-projection-audit.mjs", "tools/research-deep-research-student-archive-projection-audit.test.mjs",
  "tools/research-deep-research-student-archive-storage-precommit-runtime.mjs", "tools/research-deep-research-student-archive-storage-precommit-runtime.test.mjs",
  "tools/research-deep-research-student-archive-storage-precommit-audit.mjs", "tools/research-deep-research-student-archive-storage-precommit-audit.test.mjs",
  "tools/research-deep-research-student-archive-storage-commit-runtime.mjs", "tools/research-deep-research-student-archive-storage-commit-runtime.test.mjs",
  "tools/research-deep-research-student-archive-storage-commit-audit.mjs", "tools/research-deep-research-student-archive-storage-commit-audit.test.mjs",
  "tools/research-deep-research-student-archive-row-verification-runtime.mjs", "tools/research-deep-research-student-archive-row-verification-runtime.test.mjs",
  "tools/research-deep-research-student-archive-row-verification-audit.mjs", "tools/research-deep-research-student-archive-row-verification-audit.test.mjs",
  "tools/student-app-ai-tutor-request-runtime.mjs", "tools/student-app-ai-tutor-request-runtime.test.mjs",
  "tools/student-app-ai-tutor-request-audit.mjs", "tools/student-app-ai-tutor-request-audit.test.mjs",
  "tools/student-app-ai-tutor-worker-claim-runtime.mjs", "tools/student-app-ai-tutor-worker-claim-runtime.test.mjs",
  "tools/student-app-ai-tutor-worker-claim-audit.mjs", "tools/student-app-ai-tutor-worker-claim-audit.test.mjs",
  "tools/student-app-ai-tutor-result-runtime.mjs", "tools/student-app-ai-tutor-result-runtime.test.mjs",
  "tools/student-app-ai-tutor-result-audit.mjs", "tools/student-app-ai-tutor-result-audit.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-visibility-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-visibility-runtime.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-visibility-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-visibility-audit.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-content-precheck-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-content-precheck-runtime.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-content-precheck-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-content-precheck-audit.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-content-read-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-content-read-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-submission-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-submission-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-input-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-input-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-runtime.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source-audit.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-runtime.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source-audit.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-runtime.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source-audit.test.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-runtime.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-audit.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-plan-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-plan-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-plan-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-plan-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-worker-claim-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-input-envelope-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-content-storage-commit-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-generation-content-row-verification-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-content-student-read-verification-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-submission-verification-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact-audit.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.test.mjs", "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-audit.mjs",
  "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-audit.test.mjs",
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
  const required0302 = [
    "docs/sdd/0302-teaching-archive-material-draft-human-review.md",
    "tools/teaching-archive-material-draft-human-review-runtime.mjs",
    "tools/teaching-archive-material-draft-human-review-runtime.test.mjs",
    "tools/teaching-archive-material-draft-human-review-audit.mjs",
    "tools/teaching-archive-material-draft-human-review-audit.test.mjs",
  ];
  const required0303 = [
    "docs/sdd/0303-teaching-archive-material-draft-storage-precommit.md",
    "tools/teaching-archive-material-draft-storage-precommit-runtime.mjs",
    "tools/teaching-archive-material-draft-storage-precommit-runtime.test.mjs",
    "tools/teaching-archive-material-draft-storage-precommit-audit.mjs",
    "tools/teaching-archive-material-draft-storage-precommit-audit.test.mjs",
  ];
  const required0304 = [
    "docs/sdd/0304-teaching-archive-material-draft-storage-commit.md",
    "tools/teaching-archive-material-draft-storage-commit-runtime.mjs",
    "tools/teaching-archive-material-draft-storage-commit-runtime.test.mjs",
    "tools/teaching-archive-material-draft-storage-commit-audit.mjs",
    "tools/teaching-archive-material-draft-storage-commit-audit.test.mjs",
  ];
  const required0305 = [
    "docs/sdd/0305-teaching-archive-material-draft-storage-row-verification.md",
    "tools/teaching-archive-material-draft-storage-row-verification-runtime.mjs",
    "tools/teaching-archive-material-draft-storage-row-verification-runtime.test.mjs",
    "tools/teaching-archive-material-draft-storage-row-verification-audit.mjs",
    "tools/teaching-archive-material-draft-storage-row-verification-audit.test.mjs",
  ];
  const required0306 = [
    "docs/sdd/0306-teaching-archive-material-draft-student-product-read.md",
    "tools/teaching-archive-material-draft-student-product-read-runtime.mjs",
    "tools/teaching-archive-material-draft-student-product-read-runtime.test.mjs",
    "tools/teaching-archive-material-draft-student-product-read-audit.mjs",
    "tools/teaching-archive-material-draft-student-product-read-audit.test.mjs",
  ];
  const required0307 = [
    "docs/sdd/0307-teaching-archive-material-publication-precheck.md",
    "tools/teaching-archive-material-publication-precheck-runtime.mjs",
    "tools/teaching-archive-material-publication-precheck-runtime.test.mjs",
    "tools/teaching-archive-material-publication-precheck-audit.mjs",
    "tools/teaching-archive-material-publication-precheck-audit.test.mjs",
  ];
  const required0308 = [
    "docs/sdd/0308-teaching-archive-material-publication-approval.md",
    "tools/teaching-archive-material-publication-approval-runtime.mjs",
    "tools/teaching-archive-material-publication-approval-runtime.test.mjs",
    "tools/teaching-archive-material-publication-approval-audit.mjs",
    "tools/teaching-archive-material-publication-approval-audit.test.mjs",
  ];
  const required0309 = [
    "docs/sdd/0309-teaching-archive-material-publication-delivery-envelope.md",
    "tools/teaching-archive-material-publication-delivery-runtime.mjs",
    "tools/teaching-archive-material-publication-delivery-runtime.test.mjs",
    "tools/teaching-archive-material-publication-delivery-audit.mjs",
    "tools/teaching-archive-material-publication-delivery-audit.test.mjs",
  ];
  const required0310 = [
    "docs/sdd/0310-teaching-archive-material-publication-persistence-command.md",
    "tools/teaching-archive-material-publication-persistence-command-runtime.mjs",
    "tools/teaching-archive-material-publication-persistence-command-runtime.test.mjs",
    "tools/teaching-archive-material-publication-persistence-command-audit.mjs",
    "tools/teaching-archive-material-publication-persistence-command-audit.test.mjs",
  ];
  const required0311 = [
    "docs/sdd/0311-teaching-archive-material-publication-storage-commit.md",
    "tools/teaching-archive-material-publication-storage-commit-runtime.mjs",
    "tools/teaching-archive-material-publication-storage-commit-runtime.test.mjs",
    "tools/teaching-archive-material-publication-storage-commit-audit.mjs",
    "tools/teaching-archive-material-publication-storage-commit-audit.test.mjs",
  ];
  const required0312 = [
    "docs/sdd/0312-teaching-archive-material-publication-row-verification.md",
    "tools/teaching-archive-material-publication-row-verification-runtime.mjs",
    "tools/teaching-archive-material-publication-row-verification-runtime.test.mjs",
    "tools/teaching-archive-material-publication-row-verification-audit.mjs",
    "tools/teaching-archive-material-publication-row-verification-audit.test.mjs",
  ];
  const required0313 = [
    "docs/sdd/0313-teaching-archive-material-publication-student-app-read.md",
    "tools/teaching-archive-material-publication-student-app-read-runtime.mjs",
    "tools/teaching-archive-material-publication-student-app-read-runtime.test.mjs",
    "tools/teaching-archive-material-publication-student-app-read-audit.mjs",
    "tools/teaching-archive-material-publication-student-app-read-audit.test.mjs",
  ];
  const required0314 = [
    "docs/sdd/0314-teaching-archive-material-publication-projection-hardening.md",
    "tools/teaching-archive-material-publication-projection-hardening-runtime.mjs",
    "tools/teaching-archive-material-publication-projection-hardening-runtime.test.mjs",
    "tools/teaching-archive-material-publication-projection-hardening-audit.mjs",
    "tools/teaching-archive-material-publication-projection-hardening-audit.test.mjs",
  ];
  const required0315 = [
    "docs/sdd/0315-teaching-archive-material-published-search-foundation.md",
    "tools/teaching-archive-material-published-search-foundation-runtime.mjs",
    "tools/teaching-archive-material-published-search-foundation-runtime.test.mjs",
    "tools/teaching-archive-material-published-search-foundation-audit.mjs",
    "tools/teaching-archive-material-published-search-foundation-audit.test.mjs",
  ];
  const required0316 = [
    "docs/sdd/0316-teaching-archive-material-published-detail-metadata-read.md",
    "tools/teaching-archive-material-published-detail-metadata-read-runtime.mjs",
    "tools/teaching-archive-material-published-detail-metadata-read-runtime.test.mjs",
    "tools/teaching-archive-material-published-detail-metadata-read-audit.mjs",
    "tools/teaching-archive-material-published-detail-metadata-read-audit.test.mjs",
  ];
  const required0317 = [
    "docs/sdd/0317-teaching-archive-material-published-content-preview-precheck.md",
    "tools/teaching-archive-material-published-content-preview-precheck-runtime.mjs",
    "tools/teaching-archive-material-published-content-preview-precheck-runtime.test.mjs",
    "tools/teaching-archive-material-published-content-preview-precheck-audit.mjs",
    "tools/teaching-archive-material-published-content-preview-precheck-audit.test.mjs",
  ];
  const required0318 = [
    "docs/sdd/0318-teaching-archive-material-published-content-preview-read-foundation.md",
    "tools/teaching-archive-material-published-content-preview-read-foundation-audit.mjs",
    "tools/teaching-archive-material-published-content-preview-read-foundation-audit.test.mjs",
    "services/teaching-archive-gateway/internal/domain/published_archive_material_content_preview.go",
    "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_content_preview.go",
    "services/teaching-archive-gateway/internal/adapter/postgres/repository_archive_material_content_preview.go",
    "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_archive_item_content_preview_test.go",
  ];
  const required0319 = [
    "docs/sdd/0319-teaching-archive-material-published-content-preview-render-envelope.md",
    "tools/teaching-archive-material-published-content-preview-render-envelope-audit.mjs",
    "tools/teaching-archive-material-published-content-preview-render-envelope-audit.test.mjs",
    "services/teaching-archive-gateway/internal/usecase/render_student_app_archive_item_content_preview.go",
    "services/teaching-archive-gateway/internal/usecase/render_student_app_archive_item_content_preview_test.go",
    "contracts/openapi/teaching-archive.student-app-archive-item-content-preview-rendered.path.yaml",
  ];
  const required0320 = [
    "docs/sdd/0320-teaching-archive-material-published-study-packet.md",
    "tools/teaching-archive-material-published-study-packet-audit.mjs",
    "tools/teaching-archive-material-published-study-packet-audit.test.mjs",
    "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_study_packet.go",
    "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_study_packet_test.go",
    "contracts/openapi/teaching-archive.student-app-archive-item-study-packet.path.yaml",
  ];
  const required0321 = [
    "docs/sdd/0321-teaching-archive-material-published-learning-actions.md",
    "tools/teaching-archive-material-published-learning-actions-audit.mjs",
    "tools/teaching-archive-material-published-learning-actions-audit.test.mjs",
    "services/teaching-archive-gateway/internal/usecase/read_student_app_archive_item_learning_actions.go",
    "contracts/openapi/teaching-archive.student-app-archive-item-learning-actions.path.yaml",
  ];
  const required0322 = [
    "docs/sdd/0322-student-app-ai-tutor-published-learning-action-source.md",
    "tools/student-app-ai-tutor-published-learning-action-source-audit.mjs",
    "tools/student-app-ai-tutor-published-learning-action-source-audit.test.mjs",
  ];
  const required0323 = [
    "docs/sdd/0323-student-app-ai-tutor-worker-study-packet-input.md",
    "tools/student-app-ai-tutor-worker-study-packet-input-audit.mjs",
    "tools/student-app-ai-tutor-worker-study-packet-input-audit.test.mjs",
    "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input.go",
    "contracts/openapi/teaching-archive.tutoring-analysis-ai-tutor-study-packet-input.path.yaml",
  ];
  const required0324 = [
    "docs/sdd/0324-student-app-ai-tutor-model-execution-precheck.md",
    "tools/student-app-ai-tutor-model-execution-precheck-runtime.mjs",
    "tools/student-app-ai-tutor-model-execution-precheck-runtime.test.mjs",
    "tools/student-app-ai-tutor-model-execution-precheck-audit.mjs",
    "tools/student-app-ai-tutor-model-execution-precheck-audit.test.mjs",
  ];
  const required0325 = [
    "docs/sdd/0325-student-app-ai-tutor-controlled-answer-artifact.md",
    "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.mjs",
    "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.test.mjs",
    "tools/student-app-ai-tutor-controlled-answer-artifact-audit.mjs",
    "tools/student-app-ai-tutor-controlled-answer-artifact-audit.test.mjs",
  ];
  const required0302RuntimeEvidence = "teaching_archive_material_draft_human_review_runtime";
  const required0303RuntimeEvidence = "teaching_archive_material_draft_storage_precommit_runtime";
  const required0304RuntimeEvidence = "teaching_archive_material_draft_storage_commit_runtime";
  const required0305RuntimeEvidence = "teaching_archive_material_draft_storage_row_verification_runtime";
  const required0306RuntimeEvidence = "teaching_archive_material_draft_student_product_read_runtime";
  const required0307RuntimeEvidence = "teaching_archive_material_publication_precheck_runtime";
  const required0308RuntimeEvidence = "teaching_archive_material_publication_approval_runtime";
  const required0309RuntimeEvidence = "teaching_archive_material_publication_delivery_runtime";
  const required0310RuntimeEvidence = "teaching_archive_material_publication_persistence_command_runtime";
  const required0311RuntimeEvidence = "teaching_archive_material_publication_storage_commit_runtime";
  const required0312RuntimeEvidence = "teaching_archive_material_publication_row_verification_runtime";
  const required0313RuntimeEvidence = "teaching_archive_material_publication_student_app_read_runtime";
  const required0314RuntimeEvidence = "teaching_archive_material_publication_projection_hardening_runtime";
  const required0315RuntimeEvidence = "teaching_archive_material_published_search_foundation_runtime";
  const required0316RuntimeEvidence = "teaching_archive_material_published_detail_metadata_read_runtime";
  const required0317RuntimeEvidence = "teaching_archive_material_published_content_preview_precheck_runtime";
  const required0318RuntimeEvidence = "teaching_archive_material_published_content_preview_read_foundation";
  const required0319RuntimeEvidence = "teaching_archive_material_published_content_preview_render_envelope";
  const required0320RuntimeEvidence = "teaching_archive_material_published_study_packet";
  const required0321RuntimeEvidence = "teaching_archive_material_published_learning_actions";
  const required0322RuntimeEvidence = "student_app_ai_tutor_published_learning_action_source";
  const required0323RuntimeEvidence = "student_app_ai_tutor_worker_study_packet_input";
  const required0324RuntimeEvidence = "student_app_ai_tutor_model_execution_precheck_runtime";
  const required0325RuntimeEvidence = "student_app_ai_tutor_controlled_answer_artifact_runtime";
  const missing = [...required, ...required0302, ...required0303, ...required0304, ...required0305, ...required0306, ...required0307, ...required0308, ...required0309, ...required0310, ...required0311, ...required0312, ...required0313, ...required0314, ...required0315, ...required0316, ...required0317, ...required0318, ...required0319, ...required0320, ...required0321, ...required0322, ...required0323, ...required0324, ...required0325].filter((file) => !fs.existsSync(path.join(root, file)));
  if (missing.length > 0) {
    console.error("Missing required refactor files:");
    for (const file of missing) console.error(`- ${file}`);
    process.exit(1);
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-draft-human-review-runtime.mjs"), "utf8").includes(required0302RuntimeEvidence)) {
    fail("0302 teaching archive material draft human review runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-draft-storage-precommit-runtime.mjs"), "utf8").includes(required0303RuntimeEvidence)) {
    fail("0303 teaching archive material draft storage precommit runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-draft-storage-commit-runtime.mjs"), "utf8").includes(required0304RuntimeEvidence)) {
    fail("0304 teaching archive material draft storage commit runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-draft-storage-row-verification-runtime.mjs"), "utf8").includes(required0305RuntimeEvidence)) {
    fail("0305 teaching archive material draft storage row verification runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-draft-student-product-read-runtime.mjs"), "utf8").includes(required0306RuntimeEvidence)) {
    fail("0306 teaching archive material draft student product read runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-publication-precheck-runtime.mjs"), "utf8").includes(required0307RuntimeEvidence)) {
    fail("0307 teaching archive material publication precheck runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-publication-approval-runtime.mjs"), "utf8").includes(required0308RuntimeEvidence)) {
    fail("0308 teaching archive material publication approval runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-publication-delivery-runtime.mjs"), "utf8").includes(required0309RuntimeEvidence)) {
    fail("0309 teaching archive material publication delivery runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-publication-persistence-command-runtime.mjs"), "utf8").includes(required0310RuntimeEvidence)) {
    fail("0310 teaching archive material publication persistence command runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-publication-storage-commit-runtime.mjs"), "utf8").includes(required0311RuntimeEvidence)) {
    fail("0311 teaching archive material publication storage commit runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-publication-row-verification-runtime.mjs"), "utf8").includes(required0312RuntimeEvidence)) {
    fail("0312 teaching archive material publication row verification runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-publication-student-app-read-runtime.mjs"), "utf8").includes(required0313RuntimeEvidence)) {
    fail("0313 teaching archive material publication student app read runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-publication-projection-hardening-runtime.mjs"), "utf8").includes(required0314RuntimeEvidence)) {
    fail("0314 teaching archive material publication projection hardening runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-published-search-foundation-runtime.mjs"), "utf8").includes(required0315RuntimeEvidence)) {
    fail("0315 teaching archive material published search foundation runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-published-detail-metadata-read-runtime.mjs"), "utf8").includes(required0316RuntimeEvidence)) {
    fail("0316 teaching archive material published detail metadata read runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-published-content-preview-precheck-runtime.mjs"), "utf8").includes(required0317RuntimeEvidence)) {
    fail("0317 teaching archive material published content preview precheck runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-published-content-preview-read-foundation-audit.mjs"), "utf8").includes(required0318RuntimeEvidence)) {
    fail("0318 teaching archive material published content preview read foundation evidence id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-published-content-preview-render-envelope-audit.mjs"), "utf8").includes(required0319RuntimeEvidence)) {
    fail("0319 teaching archive material published content preview render envelope evidence id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-published-study-packet-audit.mjs"), "utf8").includes(required0320RuntimeEvidence)) {
    fail("0320 teaching archive material published study packet evidence id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/teaching-archive-material-published-learning-actions-audit.mjs"), "utf8").includes(required0321RuntimeEvidence)) {
    fail("0321 teaching archive material published learning actions evidence id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/student-app-ai-tutor-published-learning-action-source-audit.mjs"), "utf8").includes(required0322RuntimeEvidence)) {
    fail("0322 student app ai tutor published learning action source evidence id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/student-app-ai-tutor-worker-study-packet-input-audit.mjs"), "utf8").includes(required0323RuntimeEvidence)) {
    fail("0323 student app ai tutor worker study packet input evidence id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/student-app-ai-tutor-model-execution-precheck-runtime.mjs"), "utf8").includes(required0324RuntimeEvidence)) {
    fail("0324 student app ai tutor model execution precheck runtime id is missing.");
  }
  if (!fs.readFileSync(path.join(root, "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.mjs"), "utf8").includes(required0325RuntimeEvidence)) {
    fail("0325 student app ai tutor controlled answer artifact runtime id is missing.");
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
    "CreateArchiveItem", "ListArchiveItems",
    "ListStudentAppTeachingMaterials", "ListStudentAppArchiveItems", "ReadStudentAppArchiveItem", "ReadStudentAppArchiveItemContentPreview", "RenderStudentAppArchiveItemContentPreview", "ReadStudentAppArchiveItemStudyPacket", "ReadStudentAppArchiveItemLearningActions",
    "CreateStudentAppAITutorRequest", "ListStudentAppAITutorRequests", "ListStudentAppQuizSubmissions", "ListStudentAppQuestionBankDrafts", "ReadStudentAppQuestionBankDraftContent", "SubmitStudentAppQuestionBankDraftAnswer", "CreateStudentAppQuestionBankDraftAnswerScoringRequest", "ReadStudentAppQuestionBankDraftAnswerScoringResult", "ReadQuestionBankDraftAnswerScoringInput", "CreateQuizSubmission",
    "CreateScannedQuizSubmission", "SubmitTeachingQuizDraftIntent",
    "SubmitArchiveMaterialDraftIntent", "CreateAttendanceSession",
    "SelectAttendanceRandomStudents", "AgentAPIKey",
  ]) {
    if (!teachingArchiveServerConfigGo.includes(field)) {
      fail(`Teaching Archive ServerConfig missing field: ${field}`);
    }
  }
  const lineCount = (file) => fs.readFileSync(path.join(root, file), "utf8").split(/\r?\n/).length;
  const qualityHeadroomLimits = [
    ["contracts/openapi/teaching-archive.yaml", 700],
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
