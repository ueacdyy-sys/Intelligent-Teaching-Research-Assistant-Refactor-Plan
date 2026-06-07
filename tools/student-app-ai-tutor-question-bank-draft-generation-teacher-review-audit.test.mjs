import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview } from "./student-app-ai-tutor-question-bank-draft-generation-teacher-review-audit.mjs";

describe("Student App AI Tutor question-bank draft generation teacher review audit", () => {
  it("passes when teacher review is wired as a no-storage approval gate", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview(currentInputs(), { probeP99Ms: 6 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtime.runtimeId, "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime");
    assert.equal(report.runtimeSlo.p99Ms, 6);
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationTeacherReview.result.teacherReview.decision, "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED");
    assert.equal(report.safetyInvariants.questionBankContentWriteStarted, false);
    assert.equal(report.findings.every((finding) => finding.passed), true);
  });

  it("fails when controlled draft evidence is missing or already stored", async () => {
    const missing = currentInputs();
    missing.sourceControlledDraftReport = "{}";
    let report = await auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview(missing);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_controlled_draft.ready_not_stored").passed, false);

    const stored = currentInputs();
    const source = JSON.parse(stored.sourceControlledDraftReport);
    source.runtimeProbes.studentAppAiTutorQuestionBankDraftGenerationControlledDraft.result.generatedDraft.executionState = "CONTROLLED_DRAFT_STORED";
    stored.sourceControlledDraftReport = JSON.stringify(source);
    report = await auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview(stored);
    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "source_controlled_draft.ready_not_stored").passed, false);
  });

  it("fails when runtime claims storage, publication, DB, HTTP, or Swarm", async () => {
    const inputs = currentInputs();
    inputs.runtime += "\nconst unsafe = { questionBankContentWriteStarted: true, executeHttpRequestAllowed: true, swarmAllowed: true };\n";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.safety_boundaries").passed, false);
  });

  it("caps probe p99 at the teacher review control-plane budget", async () => {
    const report = await auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview(currentInputs(), { probeP99Ms: 55 });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 50);
  });

  it("fails when tests, package script, root hooks, SDD, or board omit 0284", async () => {
    const inputs = currentInputs();
    inputs.runtimeTest = "";
    inputs.packageJson = "{}";
    inputs.qualityGate = "";
    inputs.rootWorkflowCoverage = "";
    inputs.verifyStructure = "";
    inputs.architectureBoard = "";
    inputs.sdd = "";

    const report = await auditStudentAppAITutorQuestionBankDraftGenerationTeacherReview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "tests.cover_teacher_review_negative_paths").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "quality_root_structure_and_board_track_runtime").passed, false);
  });
});

function currentInputs() {
  const sourceControlledDraftReport = JSON.stringify(readyControlledDraftReport());
  const runtime = [
    "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RUNTIME_ID",
    "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_PORT",
    "StudentAppAITutorQuestionBankDraftGenerationTeacherReviewPort.recordGeneratedDraftTeacherReview",
    "recordStudentAppAITutorQuestionBankDraftGenerationTeacherReview",
    "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED",
    "QUESTION_BANK_DRAFT_REVIEW",
    "APPROVED_FOR_CONTENT_STORAGE_NOT_COMMITTED",
    "findExistingRecordByIdempotencyKey",
    "assertReplayMatches",
    "teacherReviewOnly: true",
    "controlledDraftVerified: true",
    "humanReviewCompleted: true",
    "contentStorageApprovalRecorded: true",
    "teacherReviewedRubricRecorded: true",
    "questionContentGenerated: true",
    "rawModelOutputStored: false",
    "answerKeyGeneratedByModel: false",
    "studentAnswerKeyDisclosed: false",
    "questionBankContentWriteStarted: false",
    "studentAnsweringStarted: false",
    "scoringStarted: false",
    "studentVisiblePublished: false",
    "directDatabaseAccessAllowed: false",
    "executeHttpRequestAllowed: false",
    "swarmAllowed: false",
    "requiresFutureContentStorageCommit: true",
    "rejectLeakedFields",
  ].join("\n");
  const runtimeTest = [
    "records teacher review approval without content storage",
    "uses idempotency for replay and rejects conflicting teacher reviews",
    "rejects missing ports, unsafe reviewers, unsafe source state, and unsafe policy",
    "rejects leaked model/answer fields, unknown items, unsafe text, and unsafe port results",
    "requires human review checklist, future storage commit, and controlled draft evidence refs",
  ].join("\n");
  const hooks = [
    "audit:student-app-ai-tutor-question-bank-draft-generation-teacher-review",
    "Student App AI Tutor question-bank draft generation teacher review runtime audit",
    "studentAppAiTutorQuestionBankDraftGenerationTeacherReview",
    "student-app-ai-tutor-question-bank-draft-generation-teacher-review.current.json",
    "student_app_ai_tutor_question_bank_draft_generation_teacher_review_runtime",
    "0284-student-app-ai-tutor-question-bank-draft-generation-teacher-review.md",
    "10.24/10",
    "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_TEACHER_REVIEW_RECORDED",
  ].join("\n");
  return {
    runtime,
    runtimeTest,
    sourceControlledDraftReport,
    packageJson: JSON.stringify({ scripts: { "audit:student-app-ai-tutor-question-bank-draft-generation-teacher-review": "node tools/student-app-ai-tutor-question-bank-draft-generation-teacher-review-audit.mjs" } }),
    qualityGate: hooks,
    rootWorkflowCoverage: hooks,
    verifyStructure: hooks,
    architectureBoard: hooks,
    sdd: hooks,
  };
}

function readyControlledDraftReport() {
  return {
    readiness: "READY",
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT",
    runtime: {
      runtimeId: "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime",
      commandPort: "StudentAppAITutorQuestionBankDraftGenerationControlledDraftPort.recordControlledDraftGeneration",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED",
    },
    runtimeSlo: { p99Ms: 7, totalErrors: 0 },
    safetyInvariants: {
      sanitizedQuestionDraftArtifactRecorded: true,
      questionContentGenerated: true,
      rawModelOutputStored: false,
      answerKeyGenerated: false,
      expectedAnswerGenerated: false,
      questionBankContentWriteStarted: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: {
      studentAppAiTutorQuestionBankDraftGenerationControlledDraft: {
        result: {
          schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-controlled-draft-recorded.v1",
          runtimeId: "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime",
          commandPort: "StudentAppAITutorQuestionBankDraftGenerationControlledDraftPort.recordControlledDraftGeneration",
          status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED",
          recordId: "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_001",
          boundary: {
            sanitizedQuestionDraftArtifactRecorded: true,
            questionContentGenerated: true,
            questionBankContentWriteStarted: false,
          },
          generatedDraft: {
            artifactId: "qbank_generation_controlled_draft_tutor_req_student_app_001",
            envelopeId: "qbank_generation_input_envelope_tutor_req_student_app_001",
            precheckId: "qbank_generation_model_precheck_tutor_req_student_app_001",
            planId: "qbank_generation_plan_tutor_req_student_app_001",
            claimId: "qbank_generation_claim_tutor_req_student_app_001",
            questionBankDraftRef: "local://question-bank-drafts/tutor_req_student_app_001.json",
            studentId: "student_001",
            workerId: "qbank_generation_worker_local_001",
            generationAttemptId: "qbank_generation_attempt_001",
            modelRoute: "StudentTutorAgent.generate_question_bank_draft",
            status: "CONTROLLED_DRAFT_READY_FOR_REVIEW_NOT_STORED",
            executionState: "CONTROLLED_DRAFT_RECORDED_NOT_STORED",
            items: [
              item("qbank_plan_item_001", "CALCULATION", "FOUNDATION", "Fractions with unlike denominators", 2),
              item("qbank_plan_item_002", "SHORT_ANSWER", "STANDARD", "Mixed fraction operations", 2),
              item("qbank_plan_item_003", "MULTIPLE_CHOICE", "CHALLENGE", "Error checking", 1),
            ],
          },
        },
      },
    },
  };
}

function item(itemId, questionType, difficulty, knowledgePoint, maxHints) {
  return {
    itemId,
    questionType,
    difficulty,
    knowledgePoint,
    questionText: `Practice question for ${knowledgePoint}.`,
    hintPolicy: "LIGHT_HINTS",
    maxHints,
    sourceEvidenceRef: "evidence:student-app-ai-tutor-result:tutor_req_student_app_001",
  };
}
