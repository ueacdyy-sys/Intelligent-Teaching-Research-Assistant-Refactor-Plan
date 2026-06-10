import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResultArchiveModelExecutionPrecheck,
  formatStudentAppAITutorResultArchiveModelExecutionPrecheckAudit,
} from "./student-app-ai-tutor-result-archive-model-execution-precheck-audit.mjs";

describe("Student App AI Tutor result-archive model execution precheck audit", () => {
  it("passes when result-archive worker input reaches queue-only model precheck", async () => {
    const report = await auditStudentAppAITutorResultArchiveModelExecutionPrecheck(validInputs(), {
      generatedAt: "2026-06-09T11:20:00.000Z",
      probeP99Ms: 6,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_archive_model_execution_precheck");
    assert.equal(report.runtime.sharedRuntimeId, "student_app_ai_tutor_model_execution_precheck_runtime");
    assert.equal(report.runtime.status, "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECKED");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveModelExecutionPrecheck.portSawSafeText, false);
    assert.equal(report.runtimeProbes.studentAppAiTutorResultArchiveModelExecutionPrecheck.portSawSourceBlockRef, false);
    assert.equal(report.safetyInvariants.modelInferenceAllowed, false);
    assert.match(formatStudentAppAITutorResultArchiveModelExecutionPrecheckAudit(report), /result-archive model execution precheck: READY/u);
  });

  it("fails when 0336 worker result-archive input evidence is not ready", async () => {
    const inputs = validInputs();
    inputs.source0336Report = JSON.stringify({
      readiness: "NEEDS_REMEDIATION",
      workloadType: "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT",
      runtime: { runtimeId: "student_app_ai_tutor_worker_result_archive_input", status: "BROKEN" },
      runtimeSlo: { totalErrors: 1 },
      safetyInvariants: { safeTextBlocksOnly: true, modelInferenceAllowed: false },
    });

    const report = await auditStudentAppAITutorResultArchiveModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source.0336_worker_result_archive_input_ready").passed, false);
  });

  it("fails when the shared runtime is not result-archive source aware", async () => {
    const inputs = validInputs();
    inputs.runtime = inputs.runtime.replaceAll("AI_TUTOR_RESULT_ARCHIVE", "PUBLISHED_STUDY_PACKET");

    const report = await auditStudentAppAITutorResultArchiveModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.accepts_result_archive_source_without_text_to_port").passed, false);
  });

  it("fails when result-archive regression tests are absent", async () => {
    const inputs = validInputs();
    inputs.runtimeTest = "records a queue-only model precheck without sending text or starting inference";

    const report = await auditStudentAppAITutorResultArchiveModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_result_archive_model_precheck_paths").passed, false);
  });

  it("fails when root hooks do not track 0337", async () => {
    const inputs = validInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = "";
    inputs.architectureBoard = "11.44/10";

    const report = await auditStudentAppAITutorResultArchiveModelExecutionPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_trace_board_track_0337").passed, false);
  });
});

function validInputs() {
  return {
    runtime: [
      "assertWorkerResultArchiveInputReport",
      "AI_TUTOR_RESULT_ARCHIVE",
      "sourceWorkerResultArchiveInputVerified",
      "learningActionSource: normalized.workerInput.learningActionSource",
      "hasWorkerInputEvidence",
      "worker-result-archive-input",
      "safeTextBlockTextSentToPort: false",
      "modelInferenceStarted: false",
    ].join("\n"),
    runtimeTest: [
      "records a result-archive-sourced model precheck without sending guidance text",
      "sourceWorkerResultArchiveInputVerified",
      "AI_TUTOR_RESULT_ARCHIVE",
      "mismatchedSource",
      "source_block_001",
    ].join("\n"),
    source0336Report: JSON.stringify(source0336Report()),
    packageJson: JSON.stringify({
      scripts: {
        "audit:student-app-ai-tutor-result-archive-model-execution-precheck": "node tools/student-app-ai-tutor-result-archive-model-execution-precheck-audit.mjs",
      },
    }),
    qualityGate: "Student App AI Tutor result-archive model execution precheck audit",
    rootWorkflowCoverage: "studentAppAiTutorResultArchiveModelExecutionPrecheck student-app-ai-tutor-result-archive-model-execution-precheck.current.json student_app_ai_tutor_result_archive_model_execution_precheck",
    verifyStructure: "0337-student-app-ai-tutor-result-archive-model-execution-precheck.md student-app-ai-tutor-result-archive-model-execution-precheck-audit.mjs student-app-ai-tutor-result-archive-model-execution-precheck-audit.test.mjs student_app_ai_tutor_result_archive_model_execution_precheck",
    rootTrace: "SDD 0337 student app ai tutor result archive model execution precheck",
    architectureBoard: "11.47/10 STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECKED",
    sdd: "SDD 0337 Student App AI Tutor Result Archive Model Execution Precheck",
  };
}

function source0336Report() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT",
    runtime: {
      runtimeId: "student_app_ai_tutor_worker_result_archive_input",
      status: "STUDENT_APP_AI_TUTOR_WORKER_RESULT_ARCHIVE_INPUT_READY",
    },
    runtimeSlo: { p99Ms: 4, totalErrors: 0 },
    safetyInvariants: {
      serviceAgentInternalOnly: true,
      claimedWorkerLeaseRequired: true,
      persistedLearningActionSourceRequired: true,
      resultArchiveSnapshotRequired: true,
      publishedPreviewReadsBlockedForResultArchiveSource: true,
      safeTextBlocksOnly: true,
      contentRefDisclosureAllowed: false,
      rawResultRefDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      answerKeyDisclosureAllowed: false,
      modelInferenceAllowed: false,
      ocrRagAllowed: false,
      swarmAllowed: false,
    },
  };
}
