import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultStudentArchiveRead,
  formatStudentAppAITutorResultStudentArchiveReadAudit,
} from "./student-app-ai-tutor-result-student-archive-read-audit.mjs";

describe("Student App AI Tutor result student archive read audit", () => {
  it("passes when the safe result-card read path is wired", async () => {
    const report = await auditStudentAppAITutorResultStudentArchiveRead(currentInputs(), { generatedAt: "2026-06-08T14:20:00.000Z" });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_student_archive_read_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultStudentArchiveRead.result.resultArchiveCard.archiveItemId, "tarch_student_ai_tutor_result_001");
    assert.match(formatStudentAppAITutorResultStudentArchiveReadAudit(report), /archive read runtime: READY/u);
  });

  it("fails when 0332 row verification is missing or not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.rowVerificationReport);
    source.runtime.status = "ROW_NOT_VERIFIED";
    inputs.rowVerificationReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultStudentArchiveRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.row_verification_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, model, leak, Swarm, or unsafe rendering", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceStarted: true\ncontentRefDisclosed: true\nrawModelOutputDisclosed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorResultStudentArchiveRead(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.identity_and_safety").passed, false);
  });

  it("caps probe p99 at the Student App read boundary budget", async () => {
    const report = await auditStudentAppAITutorResultStudentArchiveRead(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go read path or root hooks omit 0333", async () => {
    const inputs = currentInputs();
    inputs.postgres = "package postgres";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorResultStudentArchiveRead", "studentAppAiTutorResultStudentArchiveRowVerification");
    inputs.architectureBoard = "11.32/10";

    const report = await auditStudentAppAITutorResultStudentArchiveRead(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "go_http_postgres_openapi_read_path_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_PORT",
      "StudentAppAITutorResultStudentArchiveReadPort.readStudentVisibleArchivedResult",
      "verifyStudentAppAITutorResultStudentArchiveRead",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED",
      "StudentAppAITutorResultArchiveReadPort.readStudentVisibleArchivedResult is required",
      "findExistingRecordByIdempotencyKey",
      "studentVisibleResultCardReadVerified: true",
      "httpEndpointContractVerified: true",
      "contentRefDisclosed: false",
      "rawModelOutputDisclosed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "reads a safe student-visible result card through the injected product read port",
      "uses idempotency for replay and rejects conflicting result-card reads",
      "rejects missing port, missing card, cross-student principal, and mismatched card",
      "rejects unsafe policy, leaked fields, and missing evidence",
    ].join("\n"),
    rowVerificationReport: fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-row-verification.current.json", "utf8"),
    domain: "NormalizeStudentAppAITutorResultArchiveSnapshot\nBuildStudentAppAITutorResultArchiveCard\ncontentRef",
    usecase: "NewReadStudentAppAITutorResultArchive\nReadStudentAppAITutorResultArchive.Execute\nGetStudentAppAITutorResultArchiveSnapshot",
    usecaseTest: "TestReadStudentAppAITutorResultArchiveReturnsSafeGuidanceCard",
    http: "readStudentAppArchiveItemAITutorResultHTTP",
    httpRoutes: "parseStudentAppArchiveItemAITutorResultPath",
    httpPaths: "parseStudentAppArchiveItemAITutorResultPath",
    httpPresenter: "toStudentAppAITutorResultArchiveCardResponse",
    httpResponses: "studentAppAITutorResultArchiveCardResponse",
    httpTest: "TestReadStudentAppAITutorResultArchiveReturnsSafeCard",
    postgres: "GetStudentAppAITutorResultArchiveSnapshot\nteaching_ai_tutor_result_archive_snapshots",
    postgresSchema: "teaching_ai_tutor_result_archive_snapshots",
    postgresTest: "TestGetStudentAppAITutorResultArchiveSnapshotReadsSafeProjectionOnly",
    openApiRoot: "/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result\nteaching-archive.student-app-archive-item-ai-tutor-result.path.yaml",
    openApiPath: "readStudentAppAITutorResultArchive\narchiveItemId",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-result-student-archive-read": "node tools/student-app-ai-tutor-result-student-archive-read-audit.mjs" } }),
    qualityGate: "Student App AI Tutor result student archive read runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorResultStudentArchiveRead\nstudent-app-ai-tutor-result-student-archive-read.current.json\nstudent_app_ai_tutor_result_student_archive_read_runtime",
    verifyStructure: "0333-student-app-ai-tutor-result-student-archive-read.md\nstudent-app-ai-tutor-result-student-archive-read-runtime.mjs\nstudent-app-ai-tutor-result-student-archive-read-runtime.test.mjs\nstudent-app-ai-tutor-result-student-archive-read-audit.mjs\nstudent-app-ai-tutor-result-student-archive-read-audit.test.mjs",
    sdd: "Student App AI Tutor result student archive read StudentAppAITutorResultArchiveReadPort.readStudentVisibleArchivedResult STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED",
    architectureBoard: "11.35/10 Student App AI Tutor result student archive read STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_READ_VERIFIED",
  };
}
