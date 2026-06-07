import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorWorkerClaim,
  formatStudentAppAITutorWorkerClaimAudit,
} from "./student-app-ai-tutor-worker-claim-audit.mjs";

describe("Student App AI Tutor worker claim audit", () => {
  it("passes when worker claim uses the injected Go use case port and SKIP LOCKED evidence", async () => {
    const report = await auditStudentAppAITutorWorkerClaim(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_worker_claim_runtime");
    assert.equal(report.runtime.commandPort, "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorWorkerClaim.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_WORKER_CLAIMED");
    assert.equal(result.queue.targetUseCase, "ClaimTutoringAnalysisRequest.Execute");
    assert.equal(result.boundary.modelExecutionStarted, false);
    assert.match(formatStudentAppAITutorWorkerClaimAudit(report), /Student App AI Tutor worker claim runtime: READY/u);
  });

  it("fails when runtime claims model/result/question-bank execution or unsafe transport", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\nexecuteModelNowAllowed: true\nrecordResultNowAllowed: true\nquestionBankDraftNowAllowed: true\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorWorkerClaim(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the Student App AI Tutor worker claim budget", async () => {
    const report = await auditStudentAppAITutorWorkerClaim(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go evidence, root hooks, structure, SDD, or board omit worker claim", async () => {
    const inputs = currentInputs();
    inputs.goRepositoryTest = "package postgres_test";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorWorkerClaim", "studentAppAiTutorRequest");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("student-app-ai-tutor-worker-claim", "student-app-ai-tutor-request");
    inputs.sdd = "Student App AI Tutor request runtime without worker claim boundary";
    inputs.architectureBoard = "Student App AI Tutor request runtime 10.0/10";

    const report = await auditStudentAppAITutorWorkerClaim(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.go_claim_usecase_and_repository_evidence_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_and_root_hooks_track_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_sdd_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-worker-claim.v1" },
        principal: { properties: { role: { const: "SERVICE" } } },
        worker: { properties: { agent: { const: "StudentTutorAgent" }, skillId: { const: "tutor_student" } } },
        claimPolicy: {
          properties: {
            targetUseCase: { const: "ClaimTutoringAnalysisRequest.Execute" },
            repositoryOperation: { const: "ArchiveRepository.ClaimNextTutoringAnalysisRequest" },
            executeModelNowAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-worker-claim-recorded.v1" },
        runtimeId: { const: "student_app_ai_tutor_worker_claim_runtime" },
        commandPort: { const: "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest" },
      },
    }),
    inputExample: JSON.stringify({ worker: { workerId: "worker_student_tutor_local_01" } }),
    outputExample: JSON.stringify({ claim: { requestId: "tutor_req_student_app_001" } }),
    requestReport: JSON.stringify({ readiness: "READY" }),
    runtime: [
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_COMMAND_PORT",
      "StudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest",
      "claimStudentAppAITutorWorkerRequest",
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIM_READY",
      "STUDENT_APP_AI_TUTOR_WORKER_CLAIMED",
      "STUDENT_APP_AI_TUTOR_WORKER_NO_CLAIM",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "ClaimTutoringAnalysisRequest.Execute",
      "internalServiceOnly: true",
      "atomicSkipLockedClaimRequired: true",
      "leaseRecorded: claim.found",
      "modelExecutionStarted: false",
      "resultRecorded: false",
      "questionBankDraftCreated: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
    ].join("\n"),
    runtimeTest: [
      "claims one queued AI Tutor request through the injected use case port",
      "uses idempotency for replay and rejects conflicting worker claim inputs",
      "handles empty queue without starting model execution",
      "rejects missing ports, non-service principals, remote workers, and mismatched claims",
      "rejects model execution, result recording, question-bank drafts, direct DB/HTTP, local tools, and Swarm",
    ].join("\n"),
    goUseCase: "func NewClaimTutoringAnalysisRequest\nfunc (uc *ClaimTutoringAnalysisRequest) Execute",
    goUseCaseTest: "TestClaimTutoringAnalysisRequestAllowsInternalService\nTestClaimTutoringAnalysisRequestRejectsTeacherBeforeRepository",
    goDomain: "AuthorizeClaimTutoringAnalysisRequest\nBuildTutoringAnalysisClaimLease\nApplyTutoringAnalysisClaim",
    goDomainTest: "TestApplyTutoringAnalysisClaimReclaimsExpiredLease",
    goRepository: "ClaimNextTutoringAnalysisRequest\nFOR UPDATE SKIP LOCKED",
    goRepositoryTest: "TestClaimNextTutoringAnalysisRequestUsesAtomicSkipLockedUpdate",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-worker-claim": "node tools/student-app-ai-tutor-worker-claim-audit.mjs" } }),
    qualityGate: "Student App AI Tutor worker claim runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorWorkerClaim\nstudent-app-ai-tutor-worker-claim.current.json\nstudent_app_ai_tutor_worker_claim_runtime\nCONTRACT_AND_STUDENT_TUTOR_ASYNC_CLAIM_RUNTIME",
    verifyStructure: "0261-student-app-ai-tutor-worker-claim-runtime.md\nstudent-app-ai-tutor-worker-claim.input.schema.json\nstudent-app-ai-tutor-worker-claim.output.schema.json\nstudent-app-ai-tutor-worker-claim-runtime.mjs\nstudent-app-ai-tutor-worker-claim-audit.test.mjs",
    sdd: "Student App AI Tutor worker claim runtime\nStudentAppAITutorWorkerClaimPort.claimTutoringAnalysisRequest\nClaimTutoringAnalysisRequest.Execute\nFOR UPDATE SKIP LOCKED\nnot a model inference runtime",
    architectureBoard: "Student App AI Tutor worker claim runtime 10.1/10 ClaimTutoringAnalysisRequest.Execute FOR UPDATE SKIP LOCKED",
  };
}
