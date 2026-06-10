import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorWorkerResultArchiveInput,
  formatStudentAppAITutorWorkerResultArchiveInputAudit,
} from "./student-app-ai-tutor-worker-result-archive-input-audit.mjs";

describe("Student App AI Tutor worker result archive input audit", () => {
  it("passes when result-archive-sourced worker input is wired and tracked", () => {
    const report = auditStudentAppAITutorWorkerResultArchiveInput(validInputs(), {
      generatedAt: "2026-06-09T10:05:00.000Z",
      probeP99Ms: 5,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_worker_result_archive_input");
    assert.equal(report.runtime.status, "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT_READY");
    assert.equal(report.runtimeSlo.p99Ms, 5);
    assert.equal(report.safetyInvariants.studentFacingRequestSourceDisclosureAllowed, false);
    assert.match(formatStudentAppAITutorWorkerResultArchiveInputAudit(report), /worker result archive input: READY/u);
  });

  it("fails when 0335 result-archive learning-actions evidence is not ready", () => {
    const inputs = validInputs();
    inputs.source0335Report = JSON.stringify({ readiness: "NEEDS_REMEDIATION", runtime: { status: "BROKEN" } });

    const report = auditStudentAppAITutorWorkerResultArchiveInput(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0335_result_archive_learning_actions_ready").passed, false);
  });

  it("fails when source_type persistence is absent", () => {
    const inputs = validInputs();
    inputs.postgresSchema = "";
    inputs.postgresRepository = "";
    inputs.postgresScanners = "";

    const report = auditStudentAppAITutorWorkerResultArchiveInput(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "go.persists_and_normalizes_learning_action_source").passed, false);
  });

  it("fails when worker response leaks raw fields or student-facing request exposes source", () => {
    const inputs = validInputs();
    inputs.httpResponses += "\ntype aiTutorWorkerStudyPacketInputResponse struct { ContentRef string; Prompt string; ResultRef string }\n";
    inputs.httpResponses += "\ntype tutoringAnalysisRequestResponse struct { LearningActionSource string }\n";

    const report = auditStudentAppAITutorWorkerResultArchiveInput(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "http.openapi_internal_source_status_without_student_leak").passed, false);
  });

  it("fails when root hooks do not track 0336", () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.41/10";

    const report = auditStudentAppAITutorWorkerResultArchiveInput(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0336").passed, false);
  });
});

function validInputs() {
  return {
    source0335Report: JSON.stringify({
      readiness: "READY",
      workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS",
      runtime: { status: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED" },
      runtimeSlo: { totalErrors: 0 },
    }),
    domain: "LearningActionSource StudentAppAITutorLearningActionSourceResultArchive AI_TUTOR_RESULT_ARCHIVE BuildAITutorWorkerResultArchiveInput BuildStudentAppAITutorResultArchiveLearningActions aiTutorWorkerResultArchiveActionAvailable",
    domainTest: "TestBuildAITutorWorkerResultArchiveInputUsesSafeRenderEnvelope",
    requestDomain: "LearningActionSource TutoringAnalysisRequestLearningActionSource StudentAppAITutorLearningActionSourceResultArchive AI_TUTOR_RESULT_ARCHIVE",
    requestDomainTest: "TestNewTutoringAnalysisRequestAcceptsResultArchiveLearningSource",
    studentRequestDomain: "StudentAppAITutorLearningActionSourceResultArchive AI_TUTOR_RESULT_ARCHIVE",
    usecase: "readResultArchiveInput GetByID GetStudentAppAITutorResultArchiveSnapshot BuildStudentAppAITutorResultArchiveCard BuildStudentAppAITutorResultArchiveRenderEnvelope BuildAITutorWorkerResultArchiveInput",
    usecaseTest: "TestReadAITutorWorkerStudyPacketInputUsesResultArchiveSafeRenderSource",
    requestUsecase: "LearningActionSource readAITutorResultArchiveActionSource",
    httpResponses: [
      "type aiTutorWorkerStudyPacketInputResponse struct { LearningActionSource string; ResultArchiveStatus string; Blocks []aiTutorWorkerStudyPacketInputBlock }",
      "type aiTutorWorkerStudyPacketInputBlock struct { SourceBlockRefs []string }",
      "type tutoringAnalysisWorkerClaimResponse struct { LearningActionSource string }",
      "type tutoringAnalysisRequestResponse struct { ID string }",
    ].join("\n"),
    httpPresenters: "toAITutorWorkerStudyPacketInputResponse LearningActionSource ResultArchiveStatus SourceBlockRefs",
    httpTest: "TestReadAITutorWorkerStudyPacketInputReturnsResultArchiveSafeWorkerPackage AI_TUTOR_RESULT_ARCHIVE READY_FOR_STUDENT_APP_READ SAFE_TEXT_BLOCKS SUMMARY GUIDANCE_SECTION sourceBlockRefs",
    postgresSchema: "source_type TEXT NOT NULL DEFAULT 'PUBLISHED_STUDY_PACKET'",
    postgresRepository: "source_type request.LearningActionSource",
    postgresScanners: "source_type request.LearningActionSource",
    openApiRoot: "learningActionSource AI_TUTOR_RESULT_ARCHIVE",
    openApiPath: "learningActionSource AI_TUTOR_RESULT_ARCHIVE resultArchiveStatus READY_FOR_STUDENT_APP_READ SAFE_TEXT_BLOCKS SUMMARY GUIDANCE_SECTION sourceBlockRefs",
    packageJson: "audit:student-app-ai-tutor-worker-result-archive-input",
    qualityGate: "Student App AI Tutor worker result archive input audit",
    rootWorkflowCoverage: "studentAppAiTutorWorkerResultArchiveInput student-app-ai-tutor-worker-result-archive-input.current.json student_app_ai_tutor_worker_result_archive_input",
    verifyStructure: "0336-student-app-ai-tutor-worker-result-archive-input.md student-app-ai-tutor-worker-result-archive-input-audit.mjs student-app-ai-tutor-worker-result-archive-input-audit.test.mjs student_app_ai_tutor_worker_result_archive_input",
    rootTrace: "SDD 0336 student app ai tutor worker result archive input",
    architectureBoard: "11.44/10 SDD 0336",
    sdd: "SDD 0336 Student App AI Tutor Worker Result Archive Input",
  };
}
