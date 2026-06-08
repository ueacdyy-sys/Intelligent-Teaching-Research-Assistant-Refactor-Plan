import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditStudentAppAITutorWorkerStudyPacketInput } from "./student-app-ai-tutor-worker-study-packet-input-audit.mjs";

describe("Student App AI Tutor worker study packet input audit", () => {
  it("passes when claimed worker input rebuilds the READY study-packet boundary", () => {
    const report = auditStudentAppAITutorWorkerStudyPacketInput(validInputs(), {
      generatedAt: "2026-06-08T00:00:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.useCase, "ReadAITutorWorkerStudyPacketInput.Execute");
    assert.equal(report.safetyInvariants.claimedWorkerLeaseRequired, true);
    assert.equal(report.runtimeSlo.p99Ms, 7);
  });

  it("fails when 0322 sourced admission evidence is not ready", () => {
    const inputs = validInputs();
    inputs.source0322Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION" });

    const report = auditStudentAppAITutorWorkerStudyPacketInput(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0322_published_learning_action_source_ready").passed, false);
  });

  it("fails when the worker input response leaks raw, prompt, answer, or result fields", () => {
    const inputs = validInputs();
    inputs.httpResponses += "\ntype aiTutorWorkerStudyPacketInputResponse struct { ContentRef string; Prompt string; ExpectedAnswer string; ResultRef string }\n";

    const report = auditStudentAppAITutorWorkerStudyPacketInput(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_worker_input_without_leaks").passed, false);
  });

  it("fails when root hooks do not track 0323", () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.02/10";

    const report = auditStudentAppAITutorWorkerStudyPacketInput(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_board_hooks").passed, false);
  });
});

function validInputs() {
  const source0322Report = JSON.stringify({
    readiness: "READY",
    runtime: { status: "STUDENT_APP_AI_TUTOR_PUBLISHED_LEARNING_ACTION_SOURCE_READY" },
  });
  return {
    source0322Report,
    domain: "ReadAITutorWorkerStudyPacketInputInput AITutorWorkerStudyPacketInput ValidateAITutorWorkerStudyPacketRequest BuildAITutorWorkerStudyPacketInput BuildStudentAppArchiveItemLearningActions",
    domainTest: "TestBuildAITutorWorkerStudyPacketInputRequiresClaimedReadyStudyPacket TestBuildAITutorWorkerStudyPacketInputRejectsWrongWorker TestBuildAITutorWorkerStudyPacketInputRejectsExpiredLease TestBuildAITutorWorkerStudyPacketInputRejectsNonStudentSource",
    usecase: "ReadAITutorWorkerStudyPacketInput GetTutoringAnalysisRequestByID GetPublishedForStudentApp GetPublishedContentPreviewForStudentApp BuildStudentAppArchiveItemStudyPacket BuildStudentAppArchiveItemLearningActions",
    usecaseTest: "TestReadAITutorWorkerStudyPacketInputUsesClaimedRequestAndPublishedStudyPacket TestReadAITutorWorkerStudyPacketInputRejectsExpiredLeaseBeforePublishedReads generic GetByID reads",
    httpRoutes: "ai-tutor-study-packet-input",
    httpPaths: "/ai-tutor-study-packet-input",
    http: "ReadAITutorWorkerStudyPacketInput",
    httpResponses: "type aiTutorWorkerStudyPacketInputResponse struct { RequestID string; PacketStatus string; RenderFormat string; Blocks []string }",
    httpPresenters: "toAITutorWorkerStudyPacketInputResponse",
    httpTest: "TestReadAITutorWorkerStudyPacketInputReturnsSafeWorkerPackage body leaked",
    openApiRoot: "ai-tutor-study-packet-input",
    openApiPath: "workerId SAFE_TEXT_BLOCKS packetStatus renderFormat blocks",
    packageJson: "audit:student-app-ai-tutor-worker-study-packet-input",
    qualityGate: "Student App AI Tutor worker study packet input audit",
    rootWorkflowCoverage: "studentAppAiTutorWorkerStudyPacketInput student-app-ai-tutor-worker-study-packet-input.current.json student_app_ai_tutor_worker_study_packet_input",
    verifyStructure: "0323-student-app-ai-tutor-worker-study-packet-input.md student-app-ai-tutor-worker-study-packet-input-audit.mjs",
    architectureBoard: "11.05/10 worker study packet input",
    rootTrace: "SDD 0323 student app ai tutor worker study packet input",
    sdd: "0323 Student App AI Tutor Worker Study Packet Input",
  };
}
