import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT,
  formatStudentAppAITutorQuestionBankDraftGenerationPlan,
  recordStudentAppAITutorQuestionBankDraftGenerationPlan,
} from "./student-app-ai-tutor-question-bank-draft-generation-plan-runtime.mjs";

describe("Student App AI Tutor question-bank draft generation plan runtime", () => {
  it("records a generation plan through the injected port without generating questions", async () => {
    const port = recordingGenerationPlanPort();
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), {
      questionBankDraftGenerationPlanPort: port,
      planLogPath: tempPlanLogPath(),
      generatedAt: "2026-06-06T16:20:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-plan-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED");
    assert.equal(result.sourceResult.requestId, "tutor_req_student_app_001");
    assert.equal(result.generationPlan.planId, "qbank_generation_plan_tutor_req_student_app_001");
    assert.equal(result.generationPlan.items.length, 3);
    assert.equal(result.boundary.generationPlanOnly, true);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.boundary.questionContentGenerated, false);
    assert.equal(result.boundary.questionBankContentWriteStarted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(port.calls.length, 1);
    assert.equal(port.calls[0].generationPlan.executionState, "PLAN_RECORDED_NOT_GENERATED");
    assert.match(formatStudentAppAITutorQuestionBankDraftGenerationPlan(result), /Question content generated: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting plans", async () => {
    const planLogPath = tempPlanLogPath();
    const port = recordingGenerationPlanPort();
    const first = await recordStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), {
      questionBankDraftGenerationPlanPort: port,
      planLogPath,
    });
    const replay = await recordStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), {
      questionBankDraftGenerationPlanPort: port,
      planLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);
    assert.equal(fs.readFileSync(planLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.plannedItems[0].learningGap = "Needs a different decimal-conversion plan.";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(conflicting, {
        questionBankDraftGenerationPlanPort: port,
        planLogPath,
      }),
      /record\.planHash must be/u,
    );
  });

  it("rejects missing ports, unsafe principals, wrong source status, and unsafe policies", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(baseInput(), { planLogPath: tempPlanLogPath() }),
      /QuestionBankDraftGenerationPlanPort\.recordQuestionBankDraftGenerationPlan is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(unsafePrincipal, {
        questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
        planLogPath: tempPlanLogPath(),
      }),
      /input\.principal\.role must be SERVICE/u,
    );

    const failedSource = baseInput();
    failedSource.studentAppAiTutorResultReport.runtimeProbes.studentAppAiTutorResult.result.result.status = "FAILED";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(failedSource, {
        questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
        planLogPath: tempPlanLogPath(),
      }),
      /source\.result\.status must be SUCCEEDED/u,
    );

    for (const field of ["executeModelNowAllowed", "generateQuestionsNowAllowed", "writeQuestionBankContentNowAllowed", "studentVisiblePublishAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.generationPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(input, {
          questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
          planLogPath: tempPlanLogPath(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }
  });

  it("rejects cross-student source mismatches, invalid budget, duplicate items, and missing evidence", async () => {
    const crossScope = baseInput();
    crossScope.studentScope.archiveItemId = "tarch_other";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(crossScope, {
        questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
        planLogPath: tempPlanLogPath(),
      }),
      /input\.studentScope\.archiveItemId must be tarch_student_quiz_001/u,
    );

    const budgetMismatch = baseInput();
    budgetMismatch.budget.plannedQuestionCount = 2;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(budgetMismatch, {
        questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
        planLogPath: tempPlanLogPath(),
      }),
      /planned item count must match/u,
    );

    const duplicate = baseInput();
    duplicate.plannedItems[1].itemId = duplicate.plannedItems[0].itemId;
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(duplicate, {
        questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
        planLogPath: tempPlanLogPath(),
      }),
      /planned item ids must be unique/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:other"];
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(missingEvidence, {
        questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
        planLogPath: tempPlanLogPath(),
      }),
      /AI Tutor result evidence ref is required/u,
    );
  });

  it("rejects leaked answer keys and model output in generation plan inputs or planned items", async () => {
    const leakedTop = baseInput();
    leakedTop.rawModelOutput = "leak";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(leakedTop, {
        questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
        planLogPath: tempPlanLogPath(),
      }),
      /rawModelOutput is not allowed/u,
    );

    const leakedItem = baseInput();
    leakedItem.plannedItems[0].expectedAnswer = "3/4";
    await assert.rejects(
      () => recordStudentAppAITutorQuestionBankDraftGenerationPlan(leakedItem, {
        questionBankDraftGenerationPlanPort: recordingGenerationPlanPort(),
        planLogPath: tempPlanLogPath(),
      }),
      /expectedAnswer is not allowed/u,
    );
  });
});

function tempPlanLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-plan-")), "plan.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-plan.v1",
    planningInvocationId: "qbank_generation_plan_001",
    studentAppAiTutorResultReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result.current.json", "utf8")),
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    studentScope: {
      mode: "OWN",
      studentId: "student_001",
      archiveItemId: "tarch_student_quiz_001",
    },
    generationPolicy: generationPolicy(),
    learningObjectives: [
      "Strengthen fraction addition and subtraction with unlike denominators.",
      "Practice mixed-operation reasoning without exposing answer keys.",
    ],
    budget: {
      plannedQuestionCount: 3,
      maxPromptTokens: 1600,
      maxGenerationAttempts: 1,
      p99PlanningBudgetMs: 50,
    },
    plannedItems: plannedItems(),
    evidenceRefs: ["evidence:student-app-ai-tutor-result:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-plan:student_001:tutor_req_student_app_001",
  };
}

function generationPolicy() {
  return {
    resultEvidenceRequired: true,
    studentOwnScopeRequired: true,
    sourceArchiveEvidenceRequired: true,
    learningGapEvidenceRequired: true,
    generationPlanOnly: true,
    safetyReviewRequiredBeforeContent: true,
    idempotentPlanRequired: true,
    executeModelNowAllowed: false,
    generateQuestionsNowAllowed: false,
    writeQuestionBankContentNowAllowed: false,
    studentAnsweringAllowed: false,
    scoringAllowed: false,
    studentVisiblePublishAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
    futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
    futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
    targetContentTable: "teaching_question_bank_draft_contents",
  };
}

function plannedItems() {
  return [
    {
      itemId: "qbank_plan_item_001",
      knowledgePoint: "Fractions with unlike denominators",
      learningGap: "Needs practice finding common denominators before addition.",
      difficulty: "FOUNDATION",
      questionType: "CALCULATION",
      promptBlueprint: "Generate one fraction-addition calculation that checks common-denominator setup.",
      sourceEvidenceRef: "evidence:student-app-ai-tutor-result:tutor_req_student_app_001",
      maxHints: 2,
    },
    {
      itemId: "qbank_plan_item_002",
      knowledgePoint: "Mixed fraction operations",
      learningGap: "Needs mixed-operation practice after understanding basic fractions.",
      difficulty: "STANDARD",
      questionType: "SHORT_ANSWER",
      promptBlueprint: "Generate one short-answer reasoning prompt about choosing the correct operation.",
      sourceEvidenceRef: "evidence:student-app-ai-tutor-result:tutor_req_student_app_001",
      maxHints: 2,
    },
    {
      itemId: "qbank_plan_item_003",
      knowledgePoint: "Error checking",
      learningGap: "Needs to explain why an incorrect denominator choice fails.",
      difficulty: "CHALLENGE",
      questionType: "MULTIPLE_CHOICE",
      promptBlueprint: "Generate one multiple-choice misconception check without revealing final answers.",
      sourceEvidenceRef: "evidence:student-app-ai-tutor-result:tutor_req_student_app_001",
      maxHints: 1,
    },
  ];
}

function recordingGenerationPlanPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async recordQuestionBankDraftGenerationPlan(request) {
      calls.push(request);
      return {
        source: overrides.source ?? {
          commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT,
          targetUseCase: "PlanStudentAppQuestionBankDraftGeneration.Execute",
          targetCommandLog: "student-command-log/question-bank-draft-generation-plan",
        },
        generationPlan: overrides.generationPlan ?? {
          planId: "qbank_generation_plan_tutor_req_student_app_001",
          questionBankDraftRef: request.generationPlan.questionBankDraftRef,
          executionState: "PLAN_RECORDED_NOT_GENERATED",
        },
      };
    },
  };
}
