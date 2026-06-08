import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditTeachingArchiveMaterialPublishedLearningActions } from "./teaching-archive-material-published-learning-actions-audit.mjs";

describe("Teaching archive material published learning actions audit", () => {
  it("passes when learning actions stay inside the ready study packet and AI tutor request boundary", () => {
    const report = auditTeachingArchiveMaterialPublishedLearningActions(validInputs(), {
      generatedAt: "2026-06-08T00:00:00.000Z",
      probeP99Ms: 4,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "ReadStudentAppArchiveItemLearningActions.Execute");
    assert.equal(report.safetyInvariants.actionTargetRestrictedToStudentAppAiTutorRequests, true);
    assert.equal(report.runtimeSlo.p99Ms, 4);
  });

  it("fails when the source study packet is not ready", () => {
    const inputs = validInputs();
    inputs.source0320Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditTeachingArchiveMaterialPublishedLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0320_study_packet_ready").passed, false);
  });

  it("fails when learning actions leak prompt, preview, storage, or model fields", () => {
    const inputs = validInputs();
    inputs.httpResponses += "\ntype studentAppArchiveItemLearningActionsResponse struct { StudentID string; ContentRef string; Prompt string }\n";
    inputs.openApiPath += "\nstudentId: {}\ncontentRef: {}\ncontentPreview: {}\nprompt: {}\n";

    const report = auditTeachingArchiveMaterialPublishedLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_safe_learning_actions_endpoint").passed, false);
  });

  it("fails when root hooks do not track 0321", () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "10.96/10";

    const report = auditTeachingArchiveMaterialPublishedLearningActions(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_board_hooks").passed, false);
  });
});

function validInputs() {
  const source0320Report = JSON.stringify({
    readiness: "READY",
    runtime: { status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_STUDY_PACKET_READY" },
  });
  return {
    source0320Report,
    domain: [
      "StudentAppArchiveItemLearningActions",
      "StudentAppArchiveItemLearningActionAITutorRequest",
      "StudentAppArchiveItemLearningActionPersonalizedQuestionBank",
      "BuildStudentAppArchiveItemLearningActions",
      "AuthorizeCreateStudentAppAITutorRequest",
    ].join("\n"),
    domainTest: "BuildStudentAppArchiveItemLearningActionsRequiresReadyStudyPacket RejectsPacketMismatch",
    usecase: "ReadStudentAppArchiveItemLearningActions GetPublishedForStudentApp GetPublishedContentPreviewForStudentApp AuthorizeCreateStudentAppAITutorRequest",
    usecaseTest: "RejectsForbiddenWithoutRead",
    http: "readStudentAppArchiveItemLearningActionsHTTP",
    httpTest: "body leaked ReadStudentAppArchiveItemLearningActionsReturnsSafeActionAffordances",
    httpPaths: "/learning-actions",
    httpRoutes: "/learning-actions",
    httpConfig: "ReadStudentAppArchiveItemLearningActions",
    httpPresenters: "toStudentAppArchiveItemLearningActionsResponse",
    httpResponses: [
      "type studentAppArchiveItemLearningActionsResponse struct { ArchiveItemID string; MaterialType string; PacketStatus string; Actions []studentAppArchiveItemLearningActionResponse }",
      "type studentAppArchiveItemLearningActionResponse struct { ActionType string; State string; TargetEndpoint string; Method string; QuestionBankIntent string; RequiresTutorRequest bool }",
    ].join("\n"),
    main: "ReadStudentAppArchiveItemLearningActions",
    openApiRoot: "/v1/student-app/archive-items/{archiveItemId}/learning-actions",
    openApiPath: "operationId: readStudentAppArchiveItemLearningActions AI_TUTOR_REQUEST PERSONALIZED_QUESTION_BANK /v1/student-app/ai-tutor-requests GENERATE_PERSONALIZED_CHECK",
    packageJson: "audit:teaching-archive-material-published-learning-actions",
    qualityGate: "Teaching archive material published learning actions audit",
    rootWorkflowCoverage: "teachingArchiveMaterialPublishedLearningActions teaching-archive-material-published-learning-actions.current.json",
    verifyStructure: "0321-teaching-archive-material-published-learning-actions.md read_student_app_archive_item_learning_actions.go",
    architectureBoard: "10.99/10 learning-actions",
    rootTrace: "SDD 0321 student app archive item learning actions",
    sdd: "0321 Teaching Archive Material Published Learning Actions",
  };
}
