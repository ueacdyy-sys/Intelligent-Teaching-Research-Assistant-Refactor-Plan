import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorRequest,
  formatStudentAppAITutorRequestAudit,
} from "./student-app-ai-tutor-request-audit.mjs";

describe("Student App AI Tutor request audit", () => {
  it("passes when queue admission uses the injected Go use case port and own-student scope", async () => {
    const report = await auditStudentAppAITutorRequest(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_request_runtime");
    assert.equal(report.runtime.commandPort, "StudentAppAITutorRequestPort.createStudentAppAITutorRequest");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorRequest.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED");
    assert.equal(result.queue.targetUseCase, "CreateStudentAppAITutorRequest.Execute");
    assert.equal(result.tutoringAnalysisRequest.id, "tutor_req_student_app_001");
    assert.equal(result.boundary.studentOwnArchiveScopeEnforced, true);
    assert.match(formatStudentAppAITutorRequestAudit(report), /Student App AI Tutor request runtime: READY/u);
  });

  it("fails when runtime claims raw DB, HTTP, model execution, final evaluation, local tools, Swarm, or unsafe rendering", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nexternalModelCallNowAllowed: true\nfinalEvaluationNowAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorRequest(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the Student App AI Tutor admission budget", async () => {
    const report = await auditStudentAppAITutorRequest(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go evidence, root hooks, structure, SDD, or board omit this runtime", async () => {
    const inputs = currentInputs();
    inputs.goRepositoryTest = "package postgres_test";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("studentAppAiTutorRequest", "studentTutorAgentReadonlyRuntimeAdapter")
      .replace("student-app-ai-tutor-request.current.json", "student-tutor-agent-readonly-runtime-adapter.current.json")
      .replace("student_app_ai_tutor_request_runtime", "student_tutor_recommend_practice_readonly_adapter");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("student-app-ai-tutor-request", "student-tutor-agent-readonly-runtime-adapter");
    inputs.sdd = "Student App AI Tutor request runtime without the required runtime boundary wording";
    inputs.architectureBoard = "StudentTutorAgent recommend_practice read-only runtime";

    const report = await auditStudentAppAITutorRequest(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.go_usecase_and_repository_evidence_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_and_root_hooks_track_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_sdd_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-request.v1" },
        agentTask: { properties: { taskKind: { const: "STUDENT_TUTORING" } } },
        principalContext: { properties: { role: { const: "STUDENT" } } },
        studentArchiveScope: { properties: { expectedSourceOwnerType: { const: "STUDENT" } } },
        aiTutorRequestPolicy: {
          properties: {
            queueName: { const: "teaching_tutoring_analysis_requests" },
            externalModelCallNowAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-request-queued.v1" },
        runtimeId: { const: "student_app_ai_tutor_request_runtime" },
        commandPort: { const: "StudentAppAITutorRequestPort.createStudentAppAITutorRequest" },
        status: { const: "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED" },
        queue: { properties: { targetUseCase: { const: "CreateStudentAppAITutorRequest.Execute" } } },
        boundary: { properties: { studentOwnArchiveScopeEnforced: { const: true } } },
      },
    }),
    inputExample: JSON.stringify({ studentArchiveScope: { archiveItemId: "tarch_student_quiz_001" } }),
    outputExample: JSON.stringify({ tutoringAnalysisRequest: { id: "tutor_req_student_app_001" } }),
    studentAppFlowReport: JSON.stringify({ readiness: "READY" }),
    runtime: [
      "STUDENT_APP_AI_TUTOR_REQUEST_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_REQUEST_COMMAND_PORT",
      "StudentAppAITutorRequestPort.createStudentAppAITutorRequest",
      "queueStudentAppAITutorRequest",
      "STUDENT_APP_AI_TUTOR_REQUEST_READY",
      "STUDENT_APP_AI_TUTOR_REQUEST_QUEUED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "CreateStudentAppAITutorRequest.Execute",
      "studentOwnArchiveScopeEnforced: true",
      "teachingArchiveReadVerified: true",
      "tutoringAnalysisRequestQueued: true",
      "questionBankDraftDeferred: true",
      "asyncAnalysisRequired: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalModelCallNowAllowed: false",
      "finalEvaluationNowAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "queues a Student App AI Tutor request through the injected use case port",
      "uses idempotency for replay and rejects conflicting Student App AI Tutor requests",
      "rejects missing ports, non-student principals, cross-student archive scope, and mismatched queued requests",
      "rejects direct DB or HTTP policies, model execution, final evaluation, local tools, and Swarm",
    ].join("\n"),
    goUseCase: "func NewCreateStudentAppAITutorRequest\nfunc (uc *CreateStudentAppAITutorRequest) Execute\nCreateTutoringAnalysisRequest",
    goUseCaseTest: "TestCreateStudentAppAITutorRequestQueuesOwnStudentArchiveAnalysis\nTestCreateStudentAppAITutorRequestRejectsOtherStudentArchive",
    goDomain: "AuthorizeCreateStudentAppAITutorRequest",
    goArchiveRepository: "func (r *ArchiveRepository) GetByID",
    goRepository: "CreateTutoringAnalysisRequest\nteaching_tutoring_analysis_requests",
    goRepositoryTest: "TestCreateStudentAppAITutorRequestInsertsQueuedStudentArchiveJob",
    httpApiTest: "TestCreateStudentAppAITutorRequestReturnsCreatedResponse\nueacd",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-request": "node tools/student-app-ai-tutor-request-audit.mjs" } }),
    qualityGate: "Student App AI Tutor request runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorRequest\nstudent-app-ai-tutor-request.current.json\nstudent_app_ai_tutor_request_runtime\nCONTRACT_AND_STUDENT_TUTOR_ASYNC_REQUEST_RUNTIME",
    verifyStructure: "0260-student-app-ai-tutor-request-runtime.md\nstudent-app-ai-tutor-request.input.schema.json\nstudent-app-ai-tutor-request.output.schema.json\nstudent-app-ai-tutor-request-runtime.mjs\nstudent-app-ai-tutor-request-audit.test.mjs",
    sdd: "Student App AI Tutor request runtime\nStudentAppAITutorRequestPort.createStudentAppAITutorRequest\nCreateStudentAppAITutorRequest.Execute\nquestionBankDraftDeferred=true\nnot a model inference runtime",
    architectureBoard: "Student App AI Tutor request runtime 10.0/10 questionBankDraftDeferred=true 22,435.1 read/write RPS",
  };
}
