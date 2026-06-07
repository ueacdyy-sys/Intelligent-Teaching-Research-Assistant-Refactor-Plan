import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorResult,
  formatStudentAppAITutorResultAudit,
} from "./student-app-ai-tutor-result-audit.mjs";

describe("Student App AI Tutor result audit", () => {
  it("passes when result recording uses the injected Go use case port and lease evidence", async () => {
    const report = await auditStudentAppAITutorResult(currentInputs(), {
      generatedAt: "2026-06-05T00:01:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_RESULT_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_result_runtime");
    assert.equal(report.runtime.commandPort, "StudentAppAITutorResultPort.recordTutoringAnalysisResult");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorResult.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_RECORDED");
    assert.equal(result.queue.targetUseCase, "RecordTutoringAnalysisResult.Execute");
    assert.equal(result.boundary.studentVisibleResultPublished, false);
    assert.match(formatStudentAppAITutorResultAudit(report), /Student App AI Tutor result runtime: READY/u);
  });

  it("fails when runtime claims inline model, draft, publication, or unsafe transport", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nexecuteModelNowAllowed: true\ncreateQuestionBankDraftNowAllowed: true\nstudentVisiblePublishAllowed: true\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorResult(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the Student App AI Tutor result budget", async () => {
    const report = await auditStudentAppAITutorResult(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go evidence, root hooks, structure, SDD, or board omit result runtime", async () => {
    const inputs = currentInputs();
    inputs.goRepository = "package postgres";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorResult", "studentAppAiTutorWorkerClaim");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("student-app-ai-tutor-result", "student-app-ai-tutor-worker-claim");
    inputs.sdd = "Student App AI Tutor worker claim runtime without result boundary";
    inputs.architectureBoard = "Student App AI Tutor worker claim runtime 10.1/10";

    const report = await auditStudentAppAITutorResult(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.go_result_usecase_and_repository_evidence_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_and_root_hooks_track_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_sdd_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-result.v1" },
        principal: { properties: { role: { const: "SERVICE" } } },
        worker: { properties: { agent: { const: "StudentTutorAgent" } } },
        resultPolicy: {
          properties: {
            targetUseCase: { const: "RecordTutoringAnalysisResult.Execute" },
            writeRepositoryOperation: { const: "ArchiveRepository.RecordTutoringAnalysisResult" },
            executeModelNowAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-result-recorded.v1" },
        runtimeId: { const: "student_app_ai_tutor_result_runtime" },
        commandPort: { const: "StudentAppAITutorResultPort.recordTutoringAnalysisResult" },
      },
    }),
    inputExample: JSON.stringify({ claim: { requestId: "tutor_req_student_app_001" } }),
    outputExample: JSON.stringify({ result: { requestId: "tutor_req_student_app_001" } }),
    workerClaimReport: JSON.stringify({ readiness: "READY" }),
    runtime: [
      "STUDENT_APP_AI_TUTOR_RESULT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_COMMAND_PORT",
      "StudentAppAITutorResultPort.recordTutoringAnalysisResult",
      "recordStudentAppAITutorResult",
      "STUDENT_APP_AI_TUTOR_RESULT_READY",
      "STUDENT_APP_AI_TUTOR_RESULT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "RecordTutoringAnalysisResult.Execute",
      "internalServiceOnly: true",
      "claimRequired: true",
      "workerLeaseMustMatch: true",
      "modelExecutionStarted: false",
      "modelExecutionAlreadyCompletedElsewhere: true",
      "resultRecorded: true",
      "questionBankDraftCreated: false",
      "studentVisibleResultPublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "records a successful AI Tutor analysis result through the injected use case port",
      "uses idempotency for replay and rejects conflicting result inputs",
      "records failed analysis output without result fields",
      "rejects missing ports, non-service principals, remote workers, and mismatched leases",
      "rejects inline model execution, question-bank creation, publish, DB/HTTP, local tools, and Swarm",
    ].join("\n"),
    goUseCase: "func NewRecordTutoringAnalysisResult\nfunc (uc *RecordTutoringAnalysisResult) Execute",
    goUseCaseTest: "TestRecordTutoringAnalysisResultAllowsInternalService\nTestRecordTutoringAnalysisResultRejectsMismatchedWorkerBeforeUpdate\nTestRecordTutoringAnalysisResultRejectsFinalOverwrite",
    goDomain: "ApplyTutoringAnalysisResult\nNormalizeRecordTutoringAnalysisResultInput\nAuthorizeRecordTutoringAnalysisResult\ncanRecordTutoringAnalysisResult\nGetTutoringAnalysisRequestByID\nRecordTutoringAnalysisResult",
    goDomainTest: "ApplyTutoringAnalysisResult",
    goRepository: "UPDATE teaching_tutoring_analysis_requests\nclaimed_by_worker_id\nclaim_expires_at >",
    goHttpTest: "TestRecordTutoringAnalysisResultReturnsUpdatedResponse\nTestRecordTutoringAnalysisResultRejectsTeacherPrincipal",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-result": "node tools/student-app-ai-tutor-result-audit.mjs" } }),
    qualityGate: "Student App AI Tutor result runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorResult\nstudent-app-ai-tutor-result.current.json\nstudent_app_ai_tutor_result_runtime\nCONTRACT_AND_STUDENT_TUTOR_ASYNC_RESULT_RUNTIME",
    verifyStructure: "0262-student-app-ai-tutor-result-runtime.md\nstudent-app-ai-tutor-result.input.schema.json\nstudent-app-ai-tutor-result.output.schema.json\nstudent-app-ai-tutor-result-runtime.mjs\nstudent-app-ai-tutor-result-audit.test.mjs",
    sdd: "Student App AI Tutor result runtime\nStudentAppAITutorResultPort.recordTutoringAnalysisResult\nRecordTutoringAnalysisResult.Execute\nworker lease must match\nnot a model inference runtime",
    architectureBoard: "Student App AI Tutor result runtime 10.2/10 RecordTutoringAnalysisResult.Execute ArchiveRepository.RecordTutoringAnalysisResult",
  };
}
