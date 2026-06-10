import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { auditStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuard } from "./student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard-audit.mjs";

describe("Student App AI Tutor result-archive follow-up queue idempotency guard audit", () => {
  it("passes when pending result-archive follow-up retries are coalesced", () => {
    const report = auditStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuard(validInputs(), { generatedAt: "2026-06-10T10:40:00.000Z", probeP99Ms: 5 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_follow_up_queue_idempotency_guard");
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveFollowUpQueueIdempotencyGuard.duplicateSubmitWrites, 0);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveFollowUpQueueIdempotencyGuard.terminalSubmitWrites, 1);
    assert.equal(report.safetyInvariants.partialUniqueIndexGuardsConcurrentWriters, true);
  });

  it("fails when the usecase no longer reuses existing pending follow-ups", () => {
    const inputs = validInputs();
    inputs.createRequestUsecase = inputs.createRequestUsecase.replaceAll("FindPendingStudentAppAITutorResultArchiveFollowUpRequest", "removedPendingLookup");

    const report = auditStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "usecase.reuses_pending_follow_up_and_allows_terminal_recreate").passed, false);
  });

  it("fails when the PostgreSQL partial unique index is removed", () => {
    const inputs = validInputs();
    inputs.postgresSchema = inputs.postgresSchema.replace("CREATE UNIQUE INDEX IF NOT EXISTS idx_teaching_tutoring_analysis_requests_pending_result_archive_follow_up_unique", "CREATE INDEX IF NOT EXISTS removed");

    const report = auditStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "postgres.lookup_and_partial_unique_index_guard_pending_duplicates").passed, false);
  });

  it("fails when hooks omit the 0352 evidence", () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.89/10";

    const report = auditStudentAppAITutorResultArchiveFollowUpQueueIdempotencyGuard(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0352").passed, false);
  });
});

function validInputs() {
  const root = process.cwd();
  return Object.fromEntries(Object.entries({
    source0351Report: "reports/student-app-ai-tutor-result-archive-follow-up-depth-budget-guard.current.json",
    tutoringRequestDomain: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request.go",
    tutoringRequestDomainTest: "services/teaching-archive-gateway/internal/domain/tutoring_analysis_request_test.go",
    createRequestUsecase: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request.go",
    createRequestUsecaseTest: "services/teaching-archive-gateway/internal/usecase/create_student_app_ai_tutor_request_test.go",
    postgresTutoringRepo: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
    postgresSchema: "services/teaching-archive-gateway/internal/adapter/postgres/repository_schema.go",
    postgresSchemaTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_test.go",
    postgresTutoringTest: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis_student_app_request_test.go",
    packageJson: "package.json",
    qualityGate: "tools/quality-gate.mjs",
    rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
    verifyStructure: "tools/verify-structure.mjs",
    rootTrace: "docs/sdd/0000-root-requirements-trace.md",
    architectureBoard: "architecture-board.html",
    sdd: "docs/sdd/0352-student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard.md",
  }).map(([key, relativePath]) => [key, fs.existsSync(path.join(root, relativePath)) ? fs.readFileSync(path.join(root, relativePath), "utf8") : ""]));
}
