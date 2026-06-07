import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditStudentAppAITutorQuestionBankDraftContentPrecheck,
  formatStudentAppAITutorQuestionBankDraftContentPrecheckAudit,
} from "./student-app-ai-tutor-question-bank-draft-content-precheck-audit.mjs";

describe("Student App AI Tutor question-bank draft content precheck audit", () => {
  it("passes when content precheck blocks retrieval on top of visibility evidence", () => {
    const report = auditStudentAppAITutorQuestionBankDraftContentPrecheck(currentInputs(), {
      generatedAt: "2026-06-05T00:03:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_content_precheck_runtime");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 50, true);
    const result = report.runtimeProbes.studentAppAiTutorQuestionBankDraftContentPrecheck.result;
    assert.equal(result.precheckDecision.contentAccessDecision, "BLOCK_UNTIL_CONTENT_STORE");
    assert.equal(result.boundary.draftContentReadStarted, false);
    assert.match(formatStudentAppAITutorQuestionBankDraftContentPrecheckAudit(report), /content precheck runtime: READY/u);
  });

  it("fails when runtime claims content read, generation, model work, or unsafe transport", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndraftContentReadAllowed: true\nquestionGenerationAllowed: true\nmodelInferenceAllowed: true\nexecuteHttpRequestAllowed: true\nswarmAllowed: true\ninnerHTML\n`;

    const report = auditStudentAppAITutorQuestionBankDraftContentPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the Student App content precheck budget", () => {
    const report = auditStudentAppAITutorQuestionBankDraftContentPrecheck(currentInputs(), { probeP99Ms: 80 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when Go evidence no longer proves metadata visibility precheck", () => {
    const inputs = currentInputs();
    inputs.goUseCase = "";
    inputs.goRepository = "";

    const report = auditStudentAppAITutorQuestionBankDraftContentPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "teaching_archive.precheck_still_metadata_visibility_only").passed, false);
  });

  it("fails when root hooks, structure, SDD, or board omit the content precheck runtime", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage.replaceAll("studentAppAiTutorQuestionBankDraftContentPrecheck", "studentAppAiTutorQuestionBankDraftVisibility");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("student-app-ai-tutor-question-bank-draft-content-precheck", "student-app-ai-tutor-question-bank-draft-visibility");
    inputs.sdd = "Student App AI Tutor question-bank draft visibility runtime";
    inputs.architectureBoard = "Student App AI Tutor question-bank draft visibility runtime 10.3/10";

    const report = auditStudentAppAITutorQuestionBankDraftContentPrecheck(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-question-bank-draft-content-precheck.v1" },
        draftVisibilityResult: { properties: { runtimeId: { const: "student_app_ai_tutor_question_bank_draft_visibility_runtime" } } },
        contentPrecheckPolicy: { properties: { contentPrecheckOnly: { const: true }, authoritativeContentStoreAvailable: { const: false }, draftContentReadAllowed: { const: false } } },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.student-app.ai-tutor-question-bank-draft-content-prechecked.v1" },
        runtimeId: { const: "student_app_ai_tutor_question_bank_draft_content_precheck_runtime" },
        commandPort: { const: "StudentAppAITutorQuestionBankDraftContentPrecheckPort.recordContentRetrievalPrecheck" },
        precheckDecision: { properties: { contentAccessDecision: { const: "BLOCK_UNTIL_CONTENT_STORE" } } },
      },
    }),
    inputExample: JSON.stringify({
      draftVisibilityResult: { status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED" },
      contentPrecheckPolicy: { authoritativeContentStoreAvailable: false },
    }),
    outputExample: JSON.stringify({ precheckDecision: { contentReadAllowed: false } }),
    visibilityReport: JSON.stringify({ readiness: "READY", runtime: { runtimeId: "student_app_ai_tutor_question_bank_draft_visibility_runtime" } }),
    runtime: [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftContentPrecheckPort.recordContentRetrievalPrecheck",
      "recordStudentAppAITutorQuestionBankDraftContentPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_BLOCKED_UNTIL_CONTENT_STORE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "selectedDraft must come from the verified visibility page",
      "contentPrecheckOnly: true",
      "contentStoreAvailable: false",
      "draftContentReadStarted: false",
      "questionGenerationStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "modelInferenceStarted: false",
      "vectorSearchStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
      "student_app_ai_tutor_question_bank_draft_visibility_runtime",
    ].join("\n"),
    runtimeTest: [
      "blocks draft content retrieval until a real own-student content store exists",
      "uses idempotency for replay and rejects conflicting content precheck inputs",
      "rejects non-student principals, missing own access, missing visibility evidence, and unsafe policy",
      "rejects selected drafts that are not present in the verified visibility page",
      "rejects draft content, question, answer, score, publish, and worker fields from visibility evidence or selection",
    ].join("\n"),
    goDomain: "StudentAppQuestionBankDraft\nQuestionBankDraftRef\nListStudentAppQuestionBankDrafts",
    goUseCase: "ListStudentAppQuestionBankDrafts",
    goRepository: "ListTutoringAnalysisRequests\nquestion_bank_draft_ref IS NOT NULL",
    goHttp: "listStudentAppQuestionBankDraftMetadata",
    openApi: "operationId: listStudentAppQuestionBankDrafts",
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-content-precheck": "node tools/student-app-ai-tutor-question-bank-draft-content-precheck-audit.mjs" } }),
    qualityGate: "Student App AI Tutor question-bank draft content precheck runtime audit",
    rootWorkflowCoverage: "studentAppAiTutorQuestionBankDraftContentPrecheck\nstudent-app-ai-tutor-question-bank-draft-content-precheck.current.json\nstudent_app_ai_tutor_question_bank_draft_content_precheck_runtime\nCONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME",
    verifyStructure: "0264-student-app-ai-tutor-question-bank-draft-content-precheck-runtime.md\nstudent-app-ai-tutor-question-bank-draft-content-precheck.input.schema.json\nstudent-app-ai-tutor-question-bank-draft-content-precheck-runtime.mjs\nstudent-app-ai-tutor-question-bank-draft-content-precheck-audit.test.mjs",
    sdd: "Student App AI Tutor question-bank draft content precheck runtime\nnot a draft content retrieval runtime\nBLOCK_UNTIL_CONTENT_STORE",
    architectureBoard: "Student App AI Tutor question-bank draft content precheck runtime 10.4/10 BLOCK_UNTIL_CONTENT_STORE",
  };
}
