import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditStudentAppAITutorModelExecutionPrecheck } from "./student-app-ai-tutor-model-execution-precheck-audit.mjs";

describe("Student App AI Tutor model execution precheck audit", () => {
  it("passes when runtime records a queue-only precheck from 0323 worker input", async () => {
    const report = await auditStudentAppAITutorModelExecutionPrecheck(validInputs(), {
      generatedAt: "2026-06-08T08:00:00.000Z",
      probeP99Ms: 8,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_model_execution_precheck_runtime");
    assert.equal(report.runtimeSlo.p99Ms, 8);
    assert.equal(report.safetyInvariants.modelInferenceAllowed, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorModelExecutionPrecheck.portSawSafeText, false);
  });

  it("fails when 0323 worker input evidence is not ready", async () => {
    const inputs = validInputs();
    const source = JSON.parse(inputs.sourceWorkerInputReport);
    source.readiness = "NEEDS_REMEDIATION";
    inputs.sourceWorkerInputReport = JSON.stringify(source);

    const report = await auditStudentAppAITutorModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0323_worker_study_packet_input_ready").passed, false);
  });

  it("fails when runtime claims model inference starts", async () => {
    const inputs = validInputs();
    inputs.runtime += "\nmodelInferenceStarted: true\n";

    const report = await auditStudentAppAITutorModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("fails when negative runtime tests are missing", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a queue-only model precheck without sending text or starting inference";

    const report = await auditStudentAppAITutorModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_model_precheck_negative_paths").passed, false);
  });

  it("fails when project hooks do not track 0324", async () => {
    const inputs = validInputs();
    inputs.qualityGate = "";
    inputs.architectureBoard = "11.05/10";

    const report = await auditStudentAppAITutorModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function validInputs() {
  return {
    runtime: [
      "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK_PORT",
      "StudentAppAITutorModelExecutionPrecheckPort.recordModelExecutionPrecheck",
      "recordStudentAppAITutorModelExecutionPrecheck",
      "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "sourceWorkerStudyPacketInputVerified: true",
      "sourceWorkerInputVerified: true",
      "serviceAgentInternalOnly: true",
      "approvalVerified: true",
      "modelExecutionQueueAdmissionOnly: true",
      "futureModelExecutionApproved: true",
      "safeTextBlocksOnly: true",
      "safeTextBlockTextSentToPort: false",
      "inputHashRecorded: true",
      "promptConstructed: false",
      "modelInferenceStarted: false",
      "tutorAnswerGenerated: false",
      "tutoringResultRecorded: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalToolUseAllowed: false",
      "retrievalAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "records a queue-only model precheck without sending text or starting inference",
      "uses idempotency for safe replay and rejects conflicting prechecks",
      "rejects missing ports, unsafe principals, and unsafe policies",
      "rejects non-ready sources and leaked fields",
      "rejects unsafe port results",
    ].join("\n"),
    sourceWorkerInputReport: JSON.stringify(workerStudyPacketInputReport()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:student-app-ai-tutor-model-execution-precheck": "node tools/student-app-ai-tutor-model-execution-precheck-audit.mjs",
      },
    }),
    qualityGate: "Student App AI Tutor model execution precheck runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorModelExecutionPrecheck student-app-ai-tutor-model-execution-precheck.current.json",
    verifyStructure: "0324-student-app-ai-tutor-model-execution-precheck.md student-app-ai-tutor-model-execution-precheck-runtime.mjs student_app_ai_tutor_model_execution_precheck_runtime",
    architectureBoard: "11.08/10 STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED",
    rootTrace: "SDD 0324 student app ai tutor model execution precheck",
    sdd: "0324 Student App AI Tutor Model Execution Precheck",
  };
}

function workerStudyPacketInputReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT",
    runtime: {
      runtimeId: "student_app_ai_tutor_worker_study_packet_input",
      status: "STUDENT_APP_AI_TUTOR_WORKER_STUDY_PACKET_INPUT_READY",
    },
    runtimeSlo: { p99Ms: 4, totalErrors: 0 },
    safetyInvariants: {
      serviceAgentInternalOnly: true,
      claimedWorkerLeaseRequired: true,
      ownStudentSourceRequired: true,
      publishedStudyPacketRequired: true,
      safeTextBlocksPreviewBoundaryRequired: true,
      learningActionBoundaryRequired: true,
      contentRefExcludedFromResponse: true,
      promptExcluded: true,
      rawContentExcluded: true,
      answerKeyOrModelOutputAllowed: false,
      modelInferenceAllowed: false,
      questionBankDraftCreated: false,
      semanticRetrievalAllowed: false,
      swarmAllowed: false,
    },
  };
}
