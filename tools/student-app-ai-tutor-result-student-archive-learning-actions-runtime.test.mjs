import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT,
  verifyStudentAppAITutorResultStudentArchiveLearningActions,
} from "./student-app-ai-tutor-result-student-archive-learning-actions-runtime.mjs";

describe("Student App AI Tutor result student archive learning actions runtime", () => {
  it("reads safe result-archive learning actions through the injected product port", async () => {
    const result = await verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(), options());

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_PORT);
    assert.equal(result.learningActions.renderFormat, "SAFE_TEXT_BLOCKS");
    assert.equal(result.learningActions.actions[0].learningActionSource.sourceType, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.learningActions.actions[0].learningActionSource.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.boundary.queueAdmissionSourceVerified, true);
  });

  it("reads result-archive-sourced safe render learning actions through the shared product port", async () => {
    const archiveItemId = resultArchiveRenderArchiveItemId();
    const result = await verifyStudentAppAITutorResultStudentArchiveLearningActions(
      resultArchiveRenderInput(),
      options({ learningActions: learningActions(archiveItemId) }),
    );

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_LEARNING_ACTIONS_VERIFIED");
    assert.equal(result.sourceRender.reportRuntimeId, "student_app_ai_tutor_result_archive_student_archive_render");
    assert.equal(result.sourceRender.resultArchiveRenderWorkload, true);
    assert.equal(result.sourceRender.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.learningActions.archiveItemId, archiveItemId);
    assert.equal(result.learningActions.actions[0].targetEndpoint, "/v1/student-app/ai-tutor-requests");
  });

  it("rejects unsafe result-archive render source metadata before learning actions", async () => {
    const input = resultArchiveRenderInput();
    input.studentArchiveRenderReport.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveRender.result.sourceRead.learningActionSource = "PUBLISHED_STUDY_PACKET";

    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(input, options({ learningActions: learningActions("tarch_student_ai_tutor_result_archive_001") })),
      /learningActionSource must be AI_TUTOR_RESULT_ARCHIVE/u,
    );
  });

  it("uses idempotency for replay and rejects conflicting learning-action records", async () => {
    const verificationLogPath = tempLog();
    const first = await verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(), options({ verificationLogPath }));
    const replay = await verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(), options({ verificationLogPath }));

    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.recordId, first.recordId);

    const changed = baseInput();
    changed.studentArchiveRenderReport.runtimeProbes.studentAppAiTutorResultStudentArchiveRender.result.renderEnvelope.archiveItemId = "tarch_student_ai_tutor_result_other";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(changed, options({ verificationLogPath })),
      /existing.learningActions.archiveItemId/u,
    );
  });

  it("rejects missing port, cross-student principal, and mismatched action source", async () => {
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(), {}),
      /StudentAppAITutorResultStudentArchiveLearningActionsPort must be an object/u,
    );

    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(), { studentAppAITutorResultArchiveLearningActionsPort: {} }),
      /readStudentVisibleArchivedResultLearningActions is required/u,
    );

    const crossStudent = baseInput();
    crossStudent.principal.studentAccess.ownStudentId = "student_002";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(crossStudent, options()),
      /ownStudentId must be/u,
    );

    const mismatched = learningActions();
    mismatched.actions[0].learningActionSource.sourceType = "PUBLISHED_STUDY_PACKET";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(), options({ learningActions: mismatched })),
      /sourceType must be AI_TUTOR_RESULT_ARCHIVE/u,
    );
  });

  it("rejects unsafe policy, leaked render content, wrong target, and missing evidence", async () => {
    const unsafePolicy = baseInput();
    unsafePolicy.studentArchiveLearningActionsPolicy.rawRenderBlocksDisclosureAllowed = true;
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(unsafePolicy, options()),
      /rawRenderBlocksDisclosureAllowed must be false/u,
    );

    const leaked = learningActions();
    leaked.blocks = [{ text: "raw rendered block should not be echoed" }];
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(), options({ learningActions: leaked })),
      /leaked blocks/u,
    );

    const wrongTarget = learningActions();
    wrongTarget.actions[0].targetEndpoint = "/v1/internal/raw-result";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(baseInput(), options({ learningActions: wrongTarget })),
      /targetEndpoint must be \/v1\/student-app\/ai-tutor-requests/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [];
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveLearningActions(missingEvidence, options()),
      /source render evidence ref is required/u,
    );
  });
});

function options(overrides = {}) {
  const calls = [];
  return {
    verificationLogPath: overrides.verificationLogPath ?? tempLog(),
    generatedAt: "2026-06-09T09:35:00.000Z",
    studentAppAITutorResultArchiveLearningActionsPort: {
      async readStudentVisibleArchivedResultLearningActions(request, context) {
        calls.push({ request, context });
        return {
          found: true,
          source: learningActionsSource(),
          learningActions: overrides.learningActions ?? learningActions(),
        };
      },
    },
    calls,
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-09.student-app.ai-tutor-result-student-archive-learning-actions.v1",
    learningActionsInvocationId: "ai_tutor_result_archive_learning_actions_runtime_test_001",
    principal: {
      principalId: "student_001",
      sessionId: "sess_student_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    studentArchiveRenderReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-render.current.json", "utf8")),
    studentArchiveLearningActionsPolicy: {
      sourceRenderReportRequired: true,
      queueAdmissionSourceRequired: true,
      injectedLearningActionsPortRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      renderedHtmlAllowed: false,
      renderedMarkdownAllowed: false,
      contentRefDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      swarmAllowed: false,
      rawRenderBlocksDisclosureAllowed: false,
    },
    evidenceRefs: ["evidence:student-archive-render:student-app-ai-tutor-result-student-archive-render"],
    idempotencyKey: "student-app-ai-tutor-result-archive-learning-actions:student_001:tarch_student_ai_tutor_result_001",
  };
}

function resultArchiveRenderInput() {
  const input = baseInput();
  input.studentArchiveRenderReport = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-archive-student-archive-render.current.json", "utf8"));
  input.learningActionsInvocationId = "ai_tutor_result_archive_student_archive_learning_actions_runtime_test_001";
  input.evidenceRefs = ["evidence:student-app-ai-tutor-result-archive-student-archive-render:http"];
  input.idempotencyKey = `student-app-ai-tutor-result-archive-student-archive-learning-actions:student_001:${resultArchiveRenderArchiveItemId()}`;
  return input;
}

function resultArchiveRenderArchiveItemId() {
  const report = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-archive-student-archive-render.current.json", "utf8"));
  return report.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveRender.result.renderEnvelope.archiveItemId;
}

function learningActionsSource() {
  return {
    endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/learning-actions",
    useCase: "ReadStudentAppAITutorResultArchiveLearningActions.Execute",
    sourceRenderUseCase: "RenderStudentAppAITutorResultArchive.Execute",
    ownStudentOnly: true,
  };
}

function learningActions(archiveItemId = "tarch_student_ai_tutor_result_001") {
  return {
    archiveItemId,
    status: "READY_FOR_STUDENT_APP_READ",
    materialType: "HOMEWORK",
    renderFormat: "SAFE_TEXT_BLOCKS",
    actions: [
      {
        actionType: "AI_TUTOR_REQUEST",
        state: "AVAILABLE",
        targetEndpoint: "/v1/student-app/ai-tutor-requests",
        method: "POST",
        questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
        requiresTutorRequest: true,
        learningActionSource: {
          sourceType: "AI_TUTOR_RESULT_ARCHIVE",
          actionType: "AI_TUTOR_REQUEST",
          resultArchiveStatus: "READY_FOR_STUDENT_APP_READ",
          renderFormat: "SAFE_TEXT_BLOCKS",
        },
      },
      {
        actionType: "PERSONALIZED_QUESTION_BANK",
        state: "DEFERRED_THROUGH_AI_TUTOR",
        targetEndpoint: "/v1/student-app/ai-tutor-requests",
        method: "POST",
        questionBankIntent: "GENERATE_PERSONALIZED_CHECK",
        requiresTutorRequest: true,
        learningActionSource: {
          sourceType: "AI_TUTOR_RESULT_ARCHIVE",
          actionType: "PERSONALIZED_QUESTION_BANK",
          resultArchiveStatus: "READY_FOR_STUDENT_APP_READ",
          renderFormat: "SAFE_TEXT_BLOCKS",
        },
      },
    ],
  };
}

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-learning-actions-")), "learning-actions.jsonl");
}
