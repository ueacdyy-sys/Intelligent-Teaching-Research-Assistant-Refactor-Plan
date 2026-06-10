import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultArchiveControlledAnswerArtifact,
  formatStudentAppAITutorResultArchiveControlledAnswerArtifactAudit,
} from "./student-app-ai-tutor-result-archive-controlled-answer-artifact-audit.mjs";

describe("Student App AI Tutor result-archive controlled answer artifact audit", () => {
  it("passes when a result-archive precheck creates a review-only controlled answer artifact", async () => {
    const report = await auditStudentAppAITutorResultArchiveControlledAnswerArtifact(validInputs(), {
      generatedAt: "2026-06-09T11:30:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_controlled_answer_artifact");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_controlled_answer_artifact_runtime");
    assert.equal(report.runtime.status, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RECORDED");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveControlledAnswerArtifact.portSawGuidanceText, false);
    assert.equal(report.safetyInvariants.studentVisiblePublished, false);
    assert.match(formatStudentAppAITutorResultArchiveControlledAnswerArtifactAudit(report), /result-archive controlled answer artifact: READY/u);
  });

  it("fails when 0337 result-archive model precheck evidence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.source0337Report);
    source.readiness = "NEEDS_REMEDIATION";
    source.runtimeSlo.totalErrors = 1;
    inputs.source0337Report = JSON.stringify(source);

    const report = await auditStudentAppAITutorResultArchiveControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0337_result_archive_model_precheck_ready").passed, false);
  });

  it("fails when the shared controlled answer runtime is not result-archive aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("AI_TUTOR_RESULT_ARCHIVE", "PUBLISHED_STUDY_PACKET");

    const report = await auditStudentAppAITutorResultArchiveControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.accepts_result_archive_precheck_for_controlled_artifact").passed, false);
  });

  it("fails when result-archive controlled answer regression tests are absent", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a controlled answer artifact without result persistence or student visibility";

    const report = await auditStudentAppAITutorResultArchiveControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_controlled_answer_paths").passed, false);
  });

  it("fails when root hooks do not track 0338", async () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.47/10";

    const report = await auditStudentAppAITutorResultArchiveControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0338").passed, false);
  });
});

function validInputs() {
  return {
    runtime: [
      "sourceResultArchivePrecheckRuntimeId",
      "assertResultArchiveModelExecutionPrecheckReport",
      "student_app_ai_tutor_result_archive_model_execution_precheck",
      "AI_TUTOR_RESULT_ARCHIVE",
      "sourceWorkerResultArchiveInputVerified",
      "learningActionSource: source.learningActionSource",
      "resultArchiveStatus: source.resultArchiveStatus",
      "studentVisiblePublished: false",
    ].join("\n"),
    runtimeTest: [
      "records a result-archive-sourced controlled answer artifact for human review only",
      "rejects unsafe result-archive precheck source reports",
      "AI_TUTOR_RESULT_ARCHIVE",
      "resultArchiveStatus",
    ].join("\n"),
    source0337Report: JSON.stringify(source0337Report()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:student-app-ai-tutor-result-archive-controlled-answer-artifact": "node tools/student-app-ai-tutor-result-archive-controlled-answer-artifact-audit.mjs",
      },
    }),
    qualityGate: "Student App AI Tutor result-archive controlled answer artifact audit",
    rootWorkflowCoverage: "studentAppAiTutorResultArchiveControlledAnswerArtifact student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json student_app_ai_tutor_result_archive_controlled_answer_artifact",
    verifyStructure: "0338-student-app-ai-tutor-result-archive-controlled-answer-artifact.md student-app-ai-tutor-result-archive-controlled-answer-artifact-audit.mjs student-app-ai-tutor-result-archive-controlled-answer-artifact-audit.test.mjs student_app_ai_tutor_result_archive_controlled_answer_artifact",
    rootTrace: "SDD 0338 student app ai tutor result archive controlled answer artifact",
    architectureBoard: "11.50/10 STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
    sdd: "SDD 0338 Student App AI Tutor Result Archive Controlled Answer Artifact",
  };
}

function source0337Report() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: "student_app_ai_tutor_result_archive_model_execution_precheck",
      sharedRuntimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
      commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      status: "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorResultArchiveModelExecutionPrecheck: {
        result: {
          schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-prechecked.v1",
          runtimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
          commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
          status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
          requestId: "tutor_req_student_app_result_archive_001",
          archiveItemId: "tarch_student_ai_tutor_result_001",
          workerId: "worker_student_tutor_02",
          approvalId: "ai_tutor_model_approval_result_archive_001",
          learningActionSource: "AI_TUTOR_RESULT_ARCHIVE",
          resultArchiveStatus: "READY_FOR_STUDENT_APP_READ",
          inputHash: "a81a6025e7ebe70f730722ac145d7f0b7add977b0050be2dc9284e5b61aab0d7",
          modelExecutionPrecheck: {
            precheckId: "ai_tutor_model_precheck_result_archive_001",
            queueRef: "ai_tutor_model_queue_result_archive_001",
            modelRoute: "student_tutor_guided_help_v1",
            requestId: "tutor_req_student_app_result_archive_001",
            workerId: "worker_student_tutor_02",
            inputHash: "a81a6025e7ebe70f730722ac145d7f0b7add977b0050be2dc9284e5b61aab0d7",
            safeBlockCount: 2,
            status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
            queueAdmissionOnly: true,
            modelInferenceStarted: false,
            tutorResultRecorded: false,
            studentVisiblePublished: false,
          },
          boundary: {
            sourceWorkerResultArchiveInputVerified: true,
            sourceWorkerStudyPacketInputVerified: false,
            modelExecutionQueueAdmissionOnly: true,
            safeTextBlockTextSentToPort: false,
            modelInferenceStarted: false,
            tutorAnswerGenerated: false,
            tutoringResultRecorded: false,
            studentVisiblePublished: false,
          },
        },
      },
    },
    safetyInvariants: {
      source0336WorkerResultArchiveInputRequired: true,
      learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      internalServiceOnly: true,
      approvalRequired: true,
      modelExecutionQueueAdmissionOnly: true,
      safeTextBlocksOnly: true,
      inputHashRecorded: true,
      promptConstructed: false,
      modelInferenceAllowed: false,
      tutorAnswerGenerated: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
  };
}
