import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveFollowUpLineageGuard } from "./student-app-ai-tutor-result-archive-follow-up-lineage-guard-audit.mjs";

describe("Student App AI Tutor result-archive follow-up lineage guard audit", () => {
  it("passes when result-archive follow-up lineage is preserved", () => {
    const report = auditStudentAppAITutorResultArchiveFollowUpLineageGuard(validInputs(), { generatedAt: "2026-06-10T11:40:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_follow_up_lineage_guard");
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveFollowUpLineageGuard.followUpResult.sourceArchiveItemId, "tarch_student_ai_tutor_result_001");
    assert.equal(report.safetyInvariants.studentAppSourceTutoringRequestIdExposureAllowed, false);
  });

  it("fails when the domain no longer requires lineage source fields", () => {
    const inputs = validInputs();
    inputs.resultArchiveDomain = inputs.resultArchiveDomain.replaceAll("SourceTutoringRequestID", "RemovedSourceTutoringRequestID");

    const report = auditStudentAppAITutorResultArchiveFollowUpLineageGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "domain.snapshot_card_render_actions_preserve_lineage").passed, false);
  });

  it("fails when the PostgreSQL lineage projection is removed", () => {
    const inputs = validInputs();
    inputs.postgresSchema = inputs.postgresSchema.replaceAll("source_archive_item_id TEXT NOT NULL", "removed_source_archive_item_id TEXT");
    inputs.postgresSchema = inputs.postgresSchema.replaceAll("idx_teaching_ai_tutor_result_archive_snapshots_source_lineage", "removed_source_lineage_index");

    const report = auditStudentAppAITutorResultArchiveFollowUpLineageGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "postgres_projection_reads_and_indexes_lineage").passed, false);
  });

  it("fails when hooks omit the 0353 evidence", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.92/10";

    const report = auditStudentAppAITutorResultArchiveFollowUpLineageGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0353").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0352Report: "reports/student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard.current.json",
    resultArchiveDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_read.go",
    resultArchiveRenderDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_render.go",
    resultArchiveActionsDomain: "services/teaching-archive-gateway/internal/domain/student_app_ai_tutor_result_archive_learning_actions.go",
    workerInputDomain: "services/teaching-archive-gateway/internal/domain/ai_tutor_worker_study_packet_input.go",
    resultArchiveReadTest: "services/teaching-archive-gateway/internal/usecase/read_student_app_ai_tutor_result_archive_test.go",
    workerInputTest: "services/teaching-archive-gateway/internal/usecase/read_ai_tutor_worker_study_packet_input_test.go",
    httpPresenter: "services/teaching-archive-gateway/internal/adapter/httpapi/server_presenters.go",
    httpResponses: "services/teaching-archive-gateway/internal/adapter/httpapi/server_responses.go",
    httpResultArchiveTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_ai_tutor_result_archive_read_test.go",
    httpWorkerInputTest: "services/teaching-archive-gateway/internal/adapter/httpapi/server_tutoring_analysis_worker_study_packet_input_test.go",
    postgresSnapshotRepo: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot.go",
    postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
    postgresSnapshotTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_ai_tutor_result_archive_snapshot_test.go",
    openapiCard: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result.path.yaml",
    openapiRender: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-rendered.path.yaml",
    openapiActions: "contracts/openapi/teaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml",
    openapiWorkerInput: "contracts/openapi/teaching-archive.tutoring-analysis-ai-tutor-study-packet-input.path.yaml",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0353-student-app-ai-tutor-result-archive-follow-up-lineage-guard.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
