import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveFollowUpQueueAdmission } from "./student-app-ai-tutor-result-archive-follow-up-queue-admission-audit.mjs";

describe("Student App AI Tutor result-archive follow-up queue admission audit", () => {
  it("passes when 0348 learning actions are admitted through the existing queue endpoint", async () => {
    const report = await auditStudentAppAITutorResultArchiveFollowUpQueueAdmission(validInputs(), { generatedAt: "2026-06-09T16:20:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_follow_up_queue_admission");
    assert.equal(report.runtime.sourceEndpoint, "POST /v1/student-app/ai-tutor-requests");
    assert.equal(report.safetyInvariants.learningActionSourceRequired, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveFollowUpQueueAdmission.outputLeaks, false);
  });

  it("fails when 0348 source learning actions are not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0348Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0348Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveFollowUpQueueAdmission(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0348_learning_actions_ready").passed, false);
  });

  it("fails when the use case stops rebuilding safe result-archive actions", async () => {
    const inputs = validInputs();
    inputs.usecaseRequest = inputs.usecaseRequest.replaceAll("BuildStudentAppAITutorResultArchiveLearningActions", "BuildArchivedResultActionsRemoved");

    const report = await auditStudentAppAITutorResultArchiveFollowUpQueueAdmission(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "usecase.recomputes_safe_result_archive_actions_before_queue").passed, false);
  });

  it("fails when OpenAPI no longer admits AI_TUTOR_RESULT_ARCHIVE safely", async () => {
    const inputs = validInputs();
    inputs.learningActionSourceSchema = inputs.learningActionSourceSchema.replaceAll("AI_TUTOR_RESULT_ARCHIVE", "PUBLISHED_STUDY_PACKET_ONLY");

    const report = await auditStudentAppAITutorResultArchiveFollowUpQueueAdmission(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http_openapi.reuses_existing_student_app_ai_tutor_request_contract").passed, false);
  });

  it("fails when project hooks do not track 0349", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.80/10";

    const report = await auditStudentAppAITutorResultArchiveFollowUpQueueAdmission(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0349").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0348Report: "reports/student-app-ai-tutor-result-archive-student-archive-learning-actions.current.json",
    domainRequest: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_request.go",
    usecaseRequest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
    usecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
    httpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_request_test.go",
    postgresRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
    openApiRoot: "contracts/openapi/teaching-archive.yaml",
    openApiPath: "contracts/openapi/teaching-archive.student-app-ai-tutor-requests.path.yaml",
    learningActionSourceSchema: "contracts/openapi/teaching-archive.student-app-ai-tutor-learning-action-source.schema.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0349-student-app-ai-tutor-result-archive-follow-up-queue-admission.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
