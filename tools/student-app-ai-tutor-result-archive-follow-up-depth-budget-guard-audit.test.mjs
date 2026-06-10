import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveFollowUpDepthBudgetGuard } from "./student-app-ai-tutor-result-archive-follow-up-depth-budget-guard-audit.mjs";

describe("Student App AI Tutor result-archive follow-up depth budget guard audit", () => {
  it("passes when follow-up depth is bounded from student action to worker input", () => {
    const report = auditStudentAppAITutorResultArchiveFollowUpDepthBudgetGuard(validInputs(), { generatedAt: "2026-06-10T09:10:00.000Z", probeP99Ms: 6 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_follow_up_depth_budget_guard");
    assert.equal(report.runtime.maxFollowUpDepth, 2);
    assert.deepEqual(report.runtimeProbes.studentAppAiTutorResultArchiveFollowUpDepthBudgetGuard.transitions, ["0->1", "1->2", "2->STOP"]);
    assert.equal(report.safetyInvariants.maxDepthEmitsNoFollowUpActions, true);
  });

  it("fails when learning actions no longer stop at max depth", () => {
    const inputs = validInputs();
    inputs.resultArchiveActionsDomain = inputs.resultArchiveActionsDomain.replace("nextFollowUpDepth > maxAITutorResultArchiveFollowUpDepth", "false");

    const report = auditStudentAppAITutorResultArchiveFollowUpDepthBudgetGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain.depth_is_server_normalized_and_actions_stop_at_max").passed, false);
  });

  it("fails when queue admission no longer compares regenerated action depth", () => {
    const inputs = validInputs();
    inputs.createRequestUsecase = inputs.createRequestUsecase.replace("action.FollowUpDepth == input.LearningActionSource.FollowUpDepth", "true");

    const report = auditStudentAppAITutorResultArchiveFollowUpDepthBudgetGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "request.queue_admission_rejects_tampered_or_max_depth_sources").passed, false);
  });

  it("fails when worker input no longer revalidates persisted follow-up depth", () => {
    const inputs = validInputs();
    inputs.workerInputDomain = inputs.workerInputDomain.replace("action.FollowUpDepth == followUpDepth", "true");

    const report = auditStudentAppAITutorResultArchiveFollowUpDepthBudgetGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "persistence_and_worker_input_carry_and_revalidate_depth").passed, false);
  });

  it("fails when hooks omit the 0351 depth budget evidence", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.86/10";

    const report = auditStudentAppAITutorResultArchiveFollowUpDepthBudgetGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0351").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0350Report: "reports/student-app-ai-tutor-result-archive-follow-up-worker-continuity.current.json",
    resultArchiveReadDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_read.go",
    resultArchiveRenderDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_render.go",
    resultArchiveActionsDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_learning_actions.go",
    studentRequestDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go",
    tutoringRequestDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request.go",
    workerInputDomain: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
    createRequestUsecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
    domainActionsTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_learning_actions_test.go",
    domainRequestTest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request_test.go",
    workerInputDomainTest: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input_test.go",
    createRequestUsecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
    workerInputUsecaseTest: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input_test.go",
    httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
    httpPresenters: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
    postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
    postgresSnapshotRepo: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot.go",
    postgresTutoringRepo: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
    postgresScanners: "services/teaching-archive-gateway/internal/adapter/postgres/repository_scanners.go",
    postgresSnapshotTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot_test.go",
    postgresTutoringTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_student_app_request_test.go",
    openapiSourceSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-learning-action-source.schema.yaml",
    openapiLearningActions: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml",
    openapiWorkerInput: "contracts/openapi/teaching-archive.tutoring-analysis-ai-tutor-study-packet-input.path.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0351-student-app-ai-tutor-result-archive-follow-up-depth-budget-guard.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
