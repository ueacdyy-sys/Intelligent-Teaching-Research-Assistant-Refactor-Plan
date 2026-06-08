import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditStudentAppAITutorControlledAnswerArtifact } from "./student-app-ai-tutor-controlled-answer-artifact-audit.mjs";

describe("Student App AI Tutor controlled answer artifact audit", () => {
  it("passes when runtime records a review-only controlled answer artifact", async () => {
    const report = await auditStudentAppAITutorControlledAnswerArtifact(validInputs(), {
      generatedAt: "2026-06-08T08:20:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_controlled_answer_artifact_runtime");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.equal(report.safetyInvariants.tutoringResultRecorded, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorControlledAnswerArtifact.portSawGuidanceText, false);
  });

  it("fails when 0324 source precheck evidence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.sourceModelPrecheckReport);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.sourceModelPrecheckReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0324_model_execution_precheck_ready").passed, false);
  });

  it("fails when runtime claims result persistence or visibility", async () => {
    const inputs = validInputs();
    inputs.runtime += "\ntutoringResultRecorded: true\nstudentVisiblePublished: true\n";

    const report = await auditStudentAppAITutorControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when negative runtime tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a controlled answer artifact without result persistence or student visibility";

    const report = await auditStudentAppAITutorControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_controlled_answer_negative_paths").passed, false);
  });

  it("fails when project hooks do not track 0325", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.08/10";

    const report = await auditStudentAppAITutorControlledAnswerArtifact(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function validInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT",
      "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact",
      "recordStudentAppAITutorControlledAnswerArtifact",
      "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "sourceModelExecutionPrecheckRequired: true",
      "internalServiceOnly: true",
      "controlledAnswerArtifactRecorded: true",
      "humanReviewRequiredBeforeResult: true",
      "rawModelOutputExcluded: true",
      "promptExcluded: true",
      "answerKeyExcluded: true",
      "tutoringResultRecorded: false",
      "resultPersistenceAllowed: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalToolUseAllowed: false",
      "retrievalAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "records a controlled answer artifact without result persistence or student visibility",
      "uses idempotency for safe replay and rejects conflicting artifacts",
      "rejects missing ports, unsafe principals, and unsafe source prechecks",
      "rejects leaked fields and enabled persistence flags",
      "rejects unsafe port results",
    ].join("\n"),
    sourceModelPrecheckReport: JSON.stringify(sourcePrecheckReport()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:student-app-ai-tutor-controlled-answer-artifact": "node tools/student-app-ai-tutor-controlled-answer-artifact-audit.mjs",
      },
    }),
    qualityGate: "Student App AI Tutor controlled answer artifact runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorControlledAnswerArtifact student-app-ai-tutor-controlled-answer-artifact.current.json",
    verifyStructure: "0325-student-app-ai-tutor-controlled-answer-artifact.md student-app-ai-tutor-controlled-answer-artifact-runtime.mjs student_app_ai_tutor_controlled_answer_artifact_runtime",
    architectureBoard: "11.11/10 STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
    rootTrace: "SDD 0325 student app ai tutor controlled answer artifact",
    sdd: "0325 Student App AI Tutor Controlled Answer Artifact",
  };
}

function sourcePrecheckReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK",
    runtime: {
      runtimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
      commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
    },
    runtimeSlo: { p99Ms: 9, totalErrors: 0 },
    runtimeProbes: {
      studentAppAiTutorModelExecutionPrecheck: {
        result: {
          schemaVersion: "2026-06-08.student-app.ai-tutor-model-execution-prechecked.v1",
          runtimeId: "student_app_ai_tutor_model_execution_precheck_runtime",
          commandPort: "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
          status: "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
          requestId: "tutor_req_student_app_001",
          archiveItemId: "tarch_archive_material_001",
          workerId: "worker_student_tutor_01",
          approvalId: "ai_tutor_model_approval_001",
          inputHash: "6baa5a0d27ab0dcd80c4f9a44ef507bbffa6f0e5b2fd9aa6326f65aac0c300c1",
          modelExecutionPrecheck: {
            precheckId: "ai_tutor_model_precheck_001",
            queueRef: "ai_tutor_model_queue_001",
            modelRoute: "student_tutor_guided_help_v1",
            requestId: "tutor_req_student_app_001",
            workerId: "worker_student_tutor_01",
            inputHash: "6baa5a0d27ab0dcd80c4f9a44ef507bbffa6f0e5b2fd9aa6326f65aac0c300c1",
            safeBlockCount: 2,
            status: "AI_TUTOR_MODEL_EXECUTION_PRECHECKED_NOT_STARTED",
            queueAdmissionOnly: true,
            modelInferenceStarted: false,
            tutorResultRecorded: false,
            studentVisiblePublished: false,
          },
          boundary: {
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
      sourceWorkerStudyPacketInputRequired: true,
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
      swarmAllowed: false,
    },
  };
}
