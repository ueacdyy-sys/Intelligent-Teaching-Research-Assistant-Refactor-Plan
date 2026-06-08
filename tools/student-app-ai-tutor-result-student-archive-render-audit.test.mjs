import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultStudentArchiveRender,
  formatStudentAppAITutorResultStudentArchiveRenderAudit,
} from "./student-app-ai-tutor-result-student-archive-render-audit.mjs";

describe("Student App AI Tutor result student archive render audit", () => {
  it("passes when the safe render-envelope path is wired", async () => {
    const report = await auditStudentAppAITutorResultStudentArchiveRender(currentInputs(), { generatedAt: "2026-06-08T15:50:00.000Z" });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_student_archive_render_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultStudentArchiveRender.result.renderEnvelope.renderFormat, "SAFE_TEXT_BLOCKS");
    assert.match(formatStudentAppAITutorResultStudentArchiveRenderAudit(report), /archive render runtime: READY/u);
  });

  it("fails when 0333 safe result-card read is missing or not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.sourceReadReport);
    source.runtime.status = "READ_NOT_VERIFIED";
    inputs.sourceReadReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultStudentArchiveRender(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.read_report_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, model, leak, Swarm, or unsafe rendering", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceAllowed: true\nrenderedHtmlAllowed: true\nrenderedMarkdownAllowed: true\ncontentRefDisclosed: true\nrawModelOutputDisclosed: true\nswarmAllowed: true\n.innerHTML\n`;

    const report = await auditStudentAppAITutorResultStudentArchiveRender(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.identity_and_safety").passed, false);
  });

  it("caps probe p99 at the Student App render boundary budget", async () => {
    const report = await auditStudentAppAITutorResultStudentArchiveRender(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go render path or root hooks omit 0334", async () => {
    const inputs = currentInputs();
    inputs.domain = "package domain";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorResultStudentArchiveRender", "studentAppAiTutorResultStudentArchiveRead");
    inputs.architectureBoard = "11.35/10";

    const report = await auditStudentAppAITutorResultStudentArchiveRender(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "go_http_openapi_render_path_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT",
      "StudentAppAITutorResultStudentArchiveRenderPort.renderStudentVisibleArchivedResult",
      "verifyStudentAppAITutorResultStudentArchiveRender",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED",
      "SAFE_TEXT_BLOCKS",
      "studentVisibleRenderEnvelopeVerified: true",
      "safeTextBlocksOnly: true",
      "renderedHtmlAllowed: false",
      "renderedMarkdownAllowed: false",
      "contentRefDisclosed: false",
      "rawModelOutputDisclosed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "renders a safe student-visible result envelope through the injected product render port",
      "uses idempotency for replay and rejects conflicting render records",
      "rejects missing port, cross-student principal, and mismatched envelope",
      "rejects unsafe policy, leaked fields, unsafe text, and missing evidence",
    ].join("\n"),
    sourceReadReport: fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-read.current.json", "utf8"),
    domain: "BuildStudentAppAITutorResultArchiveRenderEnvelope\nStudentAppAITutorResultArchiveRenderFormatSafeTextBlocks\nStudentAppAITutorResultArchiveBlockTypeGuidanceSection",
    domainTest: "TestBuildStudentAppAITutorResultArchiveRenderEnvelopeReturnsSafeTextBlocks\nTestBuildStudentAppAITutorResultArchiveRenderEnvelopeRejectsUnsafeCard",
    usecase: "NewRenderStudentAppAITutorResultArchive\nRenderStudentAppAITutorResultArchive.Execute\nBuildStudentAppAITutorResultArchiveRenderEnvelope",
    usecaseTest: "TestRenderStudentAppAITutorResultArchiveUsesSafeCardReader\nTestRenderStudentAppAITutorResultArchivePropagatesReaderBoundaryErrors",
    http: "renderStudentAppArchiveItemAITutorResultHTTP",
    httpRoutes: "parseStudentAppArchiveItemAITutorResultRenderedPath\nai-tutor-result/rendered",
    httpPaths: "parseStudentAppArchiveItemAITutorResultRenderedPath\nai-tutor-result/rendered",
    httpPresenter: "toStudentAppAITutorResultArchiveRenderResponse",
    httpResponses: "studentAppAITutorResultArchiveRenderResponse\nstudentAppAITutorResultArchiveRenderBlock",
    httpTest: "TestRenderStudentAppAITutorResultArchiveReturnsSafeTextBlocks\nTestRenderStudentAppAITutorResultArchiveRejectsCrossStudentTeacherAndMethod",
    openApiRoot: "/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered\nteaching-archive.student-app-archive-item-ai-tutor-result-rendered.path.yaml",
    openApiPath: "renderStudentAppAITutorResultArchive\nSAFE_TEXT_BLOCKS\nGUIDANCE_SECTION",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-result-student-archive-render": "node tools/student-app-ai-tutor-result-student-archive-render-audit.mjs" } }),
    qualityGate: "Student App AI Tutor result student archive render runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorResultStudentArchiveRender\nstudent-app-ai-tutor-result-student-archive-render.current.json\nstudent_app_ai_tutor_result_student_archive_render_runtime",
    verifyStructure: "0334-student-app-ai-tutor-result-student-archive-render.md\nstudent-app-ai-tutor-result-student-archive-render-runtime.mjs\nstudent-app-ai-tutor-result-student-archive-render-runtime.test.mjs\nstudent-app-ai-tutor-result-student-archive-render-audit.mjs\nstudent-app-ai-tutor-result-student-archive-render-audit.test.mjs",
    rootTrace: "SDD 0334 student app ai tutor result student archive render STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED",
    sdd: "Student App AI Tutor result student archive render StudentAppAITutorResultStudentArchiveRenderPort.renderStudentVisibleArchivedResult STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED",
    architectureBoard: "11.38/10 Student App AI Tutor result student archive render STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED",
  };
}
