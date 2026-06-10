import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveFollowUpWorkerContinuity } from "./student-app-ai-tutor-result-archive-follow-up-worker-continuity-audit.mjs";

describe("Student App AI Tutor result-archive follow-up worker continuity audit", () => {
  it("passes when 0349 follow-up requests keep AI_TUTOR_RESULT_ARCHIVE provenance into worker input", () => {
    const report = auditStudentAppAITutorResultArchiveFollowUpWorkerContinuity(validInputs(), { generatedAt: "2026-06-09T17:10:00.000Z", probeP99Ms: 6 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_follow_up_worker_continuity");
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveFollowUpWorkerContinuity.outputLeaks, false);
    assert.equal(report.safetyInvariants.followUpArchiveItemIdIndependent, true);
    assert.equal(report.runtimeSlo.totalErrors, 0);
  });

  it("fails when 0349 queue admission is not ready", () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0349Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0349Report = JSON.stringify(source);

    const report = auditStudentAppAITutorResultArchiveFollowUpWorkerContinuity(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0349_follow_up_queue_admission_ready").passed, false);
  });

  it("fails when the Go worker input regression no longer covers follow-up archive ids", () => {
    const inputs = validInputs();
    inputs.workerInputTest = inputs.workerInputTest.replaceAll("TestReadAITutorWorkerStudyPacketInputUsesFollowUpResultArchiveItem", "TestReadAITutorWorkerStudyPacketInputUsesResultArchiveSafeRenderSource");

    const report = auditStudentAppAITutorResultArchiveFollowUpWorkerContinuity(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "go.worker_input_is_follow_up_archive_item_independent").passed, false);
  });

  it("fails when hooks omit the 0350 continuity evidence", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.83/10";

    const report = auditStudentAppAITutorResultArchiveFollowUpWorkerContinuity(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0350").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0349Report: "reports/student-app-ai-tutor-result-archive-follow-up-queue-admission.current.json",
    source0336Report: "reports/student-app-ai-tutor-worker-result-archive-input.current.json",
    source0337Report: "reports/student-app-ai-tutor-result-archive-model-execution-precheck.current.json",
    workerClaimReport: "reports/student-app-ai-tutor-worker-claim.current.json",
    createRequestUsecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
    workerInputUsecase: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input.go",
    workerInputDomain: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
    workerInputTest: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input_test.go",
    httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
    modelPrecheckRuntime: "tools/student-app-ai-tutor-model-execution-precheck-runtime.mjs",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0350-student-app-ai-tutor-result-archive-follow-up-worker-continuity.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
