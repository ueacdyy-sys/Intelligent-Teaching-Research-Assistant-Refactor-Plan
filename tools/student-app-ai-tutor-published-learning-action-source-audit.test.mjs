import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditStudentAppAITutorPublishedLearningActionSource } from "./student-app-ai-tutor-published-learning-action-source-audit.mjs";

describe("Student App AI Tutor published learning action source audit", () => {
  it("passes when sourced AI Tutor admission proves the READY learning action boundary", () => {
    const report = auditStudentAppAITutorPublishedLearningActionSource(validInputs(), {
      generatedAt: "2026-06-08T00:00:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "CreateStudentAppAITutorRequest.Execute");
    assert.equal(report.safetyInvariants.genericGetByIDBypassBlockedForSourcedRequests, true);
    assert.equal(report.runtimeSlo.p99Ms, 6);
  });

  it("fails when 0321 learning actions are not ready", () => {
    const inputs = validInputs();
    inputs.source0321Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditStudentAppAITutorPublishedLearningActionSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0321_learning_actions_ready").passed, false);
  });

  it("fails when the response type leaks source, content, prompt, or model fields", () => {
    const inputs = validInputs();
    inputs.httpResponses += "\ntype tutoringAnalysisRequestResponse struct { LearningActionSource string; ContentRef string; Prompt string; RawModelOutput string }\n";

    const report = auditStudentAppAITutorPublishedLearningActionSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_request_source_without_response_leak").passed, false);
  });

  it("fails when root hooks do not track 0322", () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "10.99/10";

    const report = auditStudentAppAITutorPublishedLearningActionSource(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_board_hooks").passed, false);
  });
});

function validInputs() {
  const source0321Report = JSON.stringify({
    readiness: "READY",
    runtime: { status: "TEACHING_ARCHIVE_MATERIAL_PUBLISHED_LEARNING_ACTIONS_READY" },
  });
  return {
    source0321Report,
    domain: "StudentAppAITutorLearningActionSource LearningActionSource normalizeStudentAppAITutorLearningActionSource",
    domainTest: "TestNormalizeCreateStudentAppAITutorRequestAcceptsLearningActionSource TestNormalizeCreateStudentAppAITutorRequestRejectsInvalidLearningActionSource",
    usecase: "readPublishedStudyPacketActionSource GetPublishedForStudentApp GetPublishedContentPreviewForStudentApp BuildStudentAppArchiveItemStudyPacket BuildStudentAppArchiveItemLearningActions",
    usecaseTest: "TestCreateStudentAppAITutorRequestUsesPublishedStudyPacketSource generic GetByID reads",
    http: "LearningActionSource",
    httpRequest: "learningActionSource",
    httpResponses: "type tutoringAnalysisRequestResponse struct { ID string; ArchiveItemID string; QuestionBankIntent string }",
    httpTest: "TestCreateStudentAppAITutorRequestAcceptsPublishedLearningActionSource body leaked",
    openApiRoot: "StudentAppAITutorLearningActionSource learningActionSource actionType packetStatus PERSONALIZED_QUESTION_BANK AI_TUTOR_REQUEST",
    packageJson: "audit:student-app-ai-tutor-published-learning-action-source",
    qualityGate: "Student App AI Tutor published learning action source audit",
    rootWorkflowCoverage: "studentAppAiTutorPublishedLearningActionSource student-app-ai-tutor-published-learning-action-source.current.json student_app_ai_tutor_published_learning_action_source",
    verifyStructure: "0322-student-app-ai-tutor-published-learning-action-source.md student-app-ai-tutor-published-learning-action-source-audit.mjs",
    architectureBoard: "11.02/10 published learning action source",
    rootTrace: "SDD 0322 student app ai tutor published learning action source",
    sdd: "0322 Student App AI Tutor Published Learning Action Source",
  };
}
