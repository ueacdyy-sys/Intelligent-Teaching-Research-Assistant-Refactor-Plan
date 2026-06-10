import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultStudentArchiveLearningActions,
  formatStudentAppAITutorResultStudentArchiveLearningActionsAudit,
} from "./student-app-ai-tutor-result-student-archive-learning-actions-audit.mjs";

describe("Student App AI Tutor result student archive learning actions audit", () => {
  it("passes when the render-backed learning-actions path is wired", async () => {
    const report = await auditStudentAppAITutorResultStudentArchiveLearningActions(currentInputs(), { generatedAt: "2026-06-09T09:35:00.000Z" });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_student_archive_learning_actions_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultStudentArchiveLearningActions.result.learningActions.actions[0].learningActionSource.sourceType, "AI_TUTOR_RESULT_ARCHIVE");
    assert.match(formatStudentAppAITutorResultStudentArchiveLearningActionsAudit(report), /learning actions runtime: READY/u);
  });

  it("fails when 0334 safe render-envelope evidence is missing or not ready", async () => {
    const inputs = currentInputs();
    const source = JSON.parse(inputs.sourceRenderReport);
    source.runtime.status = "RENDER_NOT_VERIFIED";
    inputs.sourceRenderReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultStudentArchiveLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.render_report_ready").passed, false);
  });

  it("fails when runtime claims raw DB, HTTP, model, leak, Swarm, or raw render disclosure", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nfetch(\nmodelInferenceAllowed: true\ncontentRefDisclosed: true\nrawModelOutputDisclosed: true\nswarmAllowed: true\n.innerHTML\n`;

    const report = await auditStudentAppAITutorResultStudentArchiveLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.identity_and_safety").passed, false);
  });

  it("caps probe p99 at the Student App learning-actions boundary budget", async () => {
    const report = await auditStudentAppAITutorResultStudentArchiveLearningActions(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go learning-actions path or root hooks omit 0335", async () => {
    const inputs = currentInputs();
    inputs.domain = "package domain";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorResultStudentArchiveLearningActions", "studentAppAiTutorResultStudentArchiveRender");
    inputs.architectureBoard = "11.38/10";

    const report = await auditStudentAppAITutorResultStudentArchiveLearningActions(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "go_http_openapi_learning_actions_path_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT",
      "StudentAppAITutorResultStudentArchiveLearningActionsPort.readStudentVisibleArchivedResultLearningActions",
      "verifyStudentAppAITutorResultStudentArchiveLearningActions",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED",
      "AI_TUTOR_RESULT_ARCHIVE",
      "queueAdmissionSourceVerified: true",
      "safeTextBlocksSourceRequired: true",
      "rawRenderBlocksDisclosed: false",
      "contentRefDisclosed: false",
      "rawModelOutputDisclosed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "reads safe result-archive learning actions through the injected product port",
      "uses idempotency for replay and rejects conflicting learning-action records",
      "rejects missing port, cross-student principal, and mismatched action source",
      "rejects unsafe policy, leaked render content, wrong target, and missing evidence",
    ].join("\n"),
    sourceRenderReport: fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-render.current.json", "utf8"),
    domain: "BuildStudentAppAITutorResultArchiveLearningActions\nStudentAppAITutorLearningActionSourceResultArchive\nTestBuildStudentAppAITutorResultArchiveLearningActionsReturnsSafeActionSources",
    domainTest: "TestBuildStudentAppAITutorResultArchiveLearningActionsReturnsSafeActionSources",
    requestDomain: "StudentAppAITutorLearningActionSourceResultArchive\nAI_TUTOR_RESULT_ARCHIVE\nREADY_FOR_STUDENT_APP_READ\nSAFE_TEXT_BLOCKS",
    requestDomainTest: "TestNormalizeCreateStudentAppAITutorRequestAcceptsResultArchiveLearningActionSource",
    usecase: "NewReadStudentAppAITutorResultArchiveLearningActions\nfunc (uc *ReadStudentAppAITutorResultArchiveLearningActions) Execute",
    usecaseTest: "TestReadStudentAppAITutorResultArchiveLearningActionsUsesSafeRenderer",
    requestUsecase: "readAITutorResultArchiveActionSource\nBuildStudentAppAITutorResultArchiveLearningActions",
    requestUsecaseTest: "TestCreateStudentAppAITutorRequestUsesResultArchiveActionSource\nTestCreateStudentAppAITutorRequestRejectsUnsafeResultArchiveActionSource",
    http: "readStudentAppArchiveItemAITutorResultLearningActionsHTTP",
    httpRoutes: "parseStudentAppArchiveItemAITutorResultLearningActionsPath\nai-tutor-result/learning-actions",
    httpPaths: "parseStudentAppArchiveItemAITutorResultLearningActionsPath\nai-tutor-result/learning-actions",
    httpPresenter: "toStudentAppAITutorResultArchiveLearningActionsResponse",
    httpResponses: "studentAppAITutorResultArchiveLearningActionsResponse\nstudentAppAITutorResultArchiveLearningActionResponse\nstudentAppAITutorResultArchiveLearningActionSource",
    httpTest: "TestReadStudentAppAITutorResultArchiveLearningActionsReturnsSafeActionSources",
    requestHttpTest: "TestCreateStudentAppAITutorRequestAcceptsResultArchiveLearningActionSource",
    openApiRoot: "/v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions\nteaching-archive.student-app-archive-item-ai-tutor-result-learning-actions.path.yaml\nteaching-archive.student-app-ai-tutor-learning-action-source.schema.yaml",
    openApiPath: "readStudentAppAITutorResultArchiveLearningActions\nAI_TUTOR_RESULT_ARCHIVE\nREADY_FOR_STUDENT_APP_READ\nSAFE_TEXT_BLOCKS",
    openApiSourceSchema: "AI_TUTOR_RESULT_ARCHIVE\nPUBLISHED_STUDY_PACKET\nREADY_FOR_STUDENT_APP_READ\nSAFE_TEXT_BLOCKS",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-result-student-archive-learning-actions": "node tools/student-app-ai-tutor-result-student-archive-learning-actions-audit.mjs" } }),
    qualityGate: "Student App AI Tutor result student archive learning actions runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorResultStudentArchiveLearningActions\nstudent-app-ai-tutor-result-student-archive-learning-actions.current.json\nstudent_app_ai_tutor_result_student_archive_learning_actions_runtime",
    verifyStructure: "0335-student-app-ai-tutor-result-student-archive-learning-actions.md\nstudent-app-ai-tutor-result-student-archive-learning-actions-runtime.mjs\nstudent-app-ai-tutor-result-student-archive-learning-actions-runtime.test.mjs\nstudent-app-ai-tutor-result-student-archive-learning-actions-audit.mjs\nstudent-app-ai-tutor-result-student-archive-learning-actions-audit.test.mjs",
    rootTrace: "SDD 0335 student app ai tutor result student archive learning actions STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED",
    sdd: "Student App AI Tutor result student archive learning actions StudentAppAITutorResultStudentArchiveLearningActionsPort.readStudentVisibleArchivedResultLearningActions STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED",
    architectureBoard: "11.41/10 Student App AI Tutor result student archive learning actions STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED",
  };
}
