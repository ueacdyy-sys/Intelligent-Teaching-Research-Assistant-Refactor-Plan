import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftVisibility,
  formatStudentAppAITutorQuestionBankDraftVisibilityAudit,
} from "./student-app-ai-tutor-question-bank-draft-visibility-audit.mjs";

describe("Student App AI Tutor question-bank draft visibility audit", () => {
  it("passes when visibility uses the injected Go use case port and metadata-only evidence", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftVisibility(currentInputs(), {
      generatedAt: "2026-06-05T00:02:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_visibility_runtime");
    assert.equal(report.runtime.readPort, "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftVisibility.result;
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED");
    assert.equal(result.source.targetUseCase, "ListStudentAppQuestionBankDrafts.Execute");
    assert.equal(result.boundary.draftContentRead, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftVisibilityAudit(report), /question-bank draft visibility runtime: READY/u);
  });

  it("fails when runtime claims draft content, generation, publication, or unsafe transport", async () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndraftContentReadAllowed: true\nquestionGenerationAllowed: true\nstudentVisiblePublishAllowed: true\ndirectDatabaseAccessAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = await auditStudentAppAITutorQuestionBankDraftVisibility(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the Student App draft visibility budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftVisibility(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go evidence, root hooks, structure, SDD, or board omit visibility runtime", async () => {
    const inputs = currentInputs();
    inputs.goRepository = "package postgres";
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftVisibility", "studentAppAiTutorResult");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("student-app-ai-tutor-question-bank-draft-visibility", "student-app-ai-tutor-result");
    inputs.sdd = "Student App AI Tutor result runtime without visibility boundary";
    inputs.architectureBoard = "Student App AI Tutor result runtime 10.2/10";

    const report = await auditStudentAppAITutorQuestionBankDraftVisibility(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.go_visibility_usecase_repository_and_http_evidence_exists").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_and_root_hooks_track_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_sdd_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility.v1" },
        principal: { properties: { role: { const: "STUDENT" }, studentAccess: { properties: { mode: { const: "OWN" } } } } },
        visibilityPolicy: {
          properties: {
            targetUseCase: { const: "ListStudentAppQuestionBankDrafts.Execute" },
            repositoryOperation: { const: "ArchiveRepository.ListTutoringAnalysisRequests" },
            draftContentReadAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-question-bank-draft-visibility-listed.v1" },
        runtimeId: { const: "student_app_ai_tutor_question_bank_draft_visibility_runtime" },
        readPort: { const: "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts" },
      },
    }),
    inputExample: JSON.stringify({ principal: { studentAccess: { ownStudentId: "student_001" } } }),
    outputExample: JSON.stringify({ draftVisibilityPage: { items: [{ questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json" }] } }),
    resultReport: JSON.stringify({ readiness: "READY" }),
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READ_PORT",
      "StudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts",
      "listStudentAppAITutorQuestionBankDraftVisibility",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "ListStudentAppQuestionBankDrafts.Execute",
      "ownStudentOnly: true",
      "succeededAnalysisOnly: true",
      "questionBankDraftRefRequired: true",
      "draftContentRead: false",
      "questionGenerationStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
    ].join("\n"),
    runtimeTest: [
      "lists own succeeded question-bank draft metadata through the injected use case port",
      "uses idempotency for replay and rejects conflicting visibility inputs",
      "rejects missing ports, non-student principals, non-own access, and invalid pagination",
      "rejects draft content, generation, answering, scoring, publication, DB/HTTP, tools, and Swarm",
      "rejects leaked student, worker, draft content, answer, score, and publish fields from the port result",
    ].join("\n"),
    goUseCase: "func NewListStudentAppQuestionBankDrafts\nfunc (uc *ListStudentAppQuestionBankDrafts) Execute",
    goUseCaseTest: "TestListStudentAppQuestionBankDraftsProjectsOwnDraftMetadata\nTestListStudentAppQuestionBankDraftsRejectsForbiddenWithoutRepositoryRead",
    goDomain: "NormalizeListStudentAppQuestionBankDraftsInput\nAuthorizeListStudentAppQuestionBankDrafts\nBuildStudentAppQuestionBankDraftPage\nNewStudentAppQuestionBankDraft\nRequireQuestionBankDraftRef = true\nTutoringAnalysisStatusSucceeded\nOwnerTypeStudent\nScopeStudentOwnRead\nStudentAccessOwn",
    goDomainTest: "NormalizeListStudentAppQuestionBankDraftsInput",
    goRepository: "ListTutoringAnalysisRequests\nquestion_bank_draft_ref IS NOT NULL\nsource_archive_student_id =",
    goHttp: "listStudentAppQuestionBankDraftMetadata",
    goHttpTest: "TestListStudentAppQuestionBankDraftsReturnsOwnDraftRefs",
    openApi: "operationId: listStudentAppQuestionBankDrafts",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-visibility": "node tools/student-app-ai-tutor-question-bank-draft-visibility-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft visibility runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftVisibility\nstudent-app-ai-tutor-question-bank-draft-visibility.current.json\nstudent_app_ai_tutor_question_bank_draft_visibility_runtime\nCONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_RUNTIME",
    verifyStructure: "0263-student-app-ai-tutor-question-bank-draft-visibility-runtime.md\nstudent-app-ai-tutor-question-bank-draft-visibility.input.schema.json\nstudent-app-ai-tutor-question-bank-draft-visibility.output.schema.json\nstudent-app-ai-tutor-question-bank-draft-visibility-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-visibility-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft visibility runtime\nStudentAppAITutorQuestionBankDraftVisibilityPort.listStudentAppQuestionBankDrafts\nListStudentAppQuestionBankDrafts.Execute\nnot a question generation runtime\nnot a draft content retrieval runtime",
    architectureBoard: "Student App AI Tutor question-bank draft visibility runtime 10.3/10 ListStudentAppQuestionBankDrafts.Execute ArchiveRepository.ListTutoringAnalysisRequests",
  };
}
