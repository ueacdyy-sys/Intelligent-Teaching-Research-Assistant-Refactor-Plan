import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveReviewedResultPersistenceBridge } from "./student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge-audit.mjs";

describe("Student App AI Tutor result-archive reviewed result persistence bridge audit", () => {
  it("passes when a reviewed result-archive answer is persisted through the existing result port", async () => {
    const report = await auditStudentAppAITutorResultArchiveReviewedResultPersistenceBridge(validInputs(), {
      generatedAt: "2026-06-09T12:10:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_reviewed_result_persistence_bridge");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_reviewed_result_persistence_bridge_runtime");
    assert.equal(report.safetyInvariants.tutoringResultRecorded, true);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveReviewedResultPersistenceBridge.portCalls, 1);
  });

  it("fails when 0339 answer review gate is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0339Report);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.source0339Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveReviewedResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0339_result_archive_answer_review_gate_ready").passed, false);
  });

  it("fails when runtime is not result-archive source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("sourceResultArchiveRuntimeId", "sourceResultArchiveRuntimeRemoved");

    const report = await auditStudentAppAITutorResultArchiveReviewedResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.source_aware_result_archive_reviewed_persistence").passed, false);
  });

  it("fails when result-archive regression tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "persists an approved answer review through RecordTutoringAnalysisResult without guidance text or student visibility";

    const report = await auditStudentAppAITutorResultArchiveReviewedResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_reviewed_persistence_paths").passed, false);
  });

  it("fails when project hooks do not track 0340", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.53/10";

    const report = await auditStudentAppAITutorResultArchiveReviewedResultPersistenceBridge(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0340").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    runtime: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.mjs",
    runtimeTest: "tools/student-app-ai-tutor-reviewed-result-persistence-bridge-runtime.test.mjs",
    source0339Report: "reports/student-app-ai-tutor-result-archive-answer-review-gate.current.json",
    goUseCase: "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result.go",
    goUseCaseTest: "services/teaching-archive-gateway/internal/usecase/record_tutoring_analysis_result_test.go",
    goDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_result.go",
    goRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
    goHttpTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_test.go",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0340-student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
