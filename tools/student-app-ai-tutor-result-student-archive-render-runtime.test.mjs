import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT,
  verifyStudentAppAITutorResultStudentArchiveRender,
} from "./student-app-ai-tutor-result-student-archive-render-runtime.mjs";

describe("Student App AI Tutor result student archive render runtime", () => {
  it("renders a safe student-visible result envelope through the injected product render port", async () => {
    const result = await verifyStudentAppAITutorResultStudentArchiveRender(baseInput(), options());

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_PORT);
    assert.equal(result.renderEnvelope.renderFormat, "SAFE_TEXT_BLOCKS");
    assert.equal(result.renderEnvelope.blocks[0].blockType, "SUMMARY");
    assert.equal(result.renderEnvelope.blocks[1].blockType, "GUIDANCE_SECTION");
    assert.equal(result.boundary.studentVisibleRenderEnvelopeVerified, true);
    assert.equal(result.boundary.renderedHtmlAllowed, false);
  });

  it("renders a result-archive-sourced safe student-visible result envelope through the same product render port", async () => {
    const result = await verifyStudentAppAITutorResultStudentArchiveRender(
      resultArchiveInput(),
      options({ envelope: resultArchiveRenderEnvelope() }),
    );

    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_RENDER_VERIFIED");
    assert.equal(result.sourceRead.reportRuntimeId, "student_app_ai_tutor_result_archive_student_archive_read");
    assert.equal(result.sourceRead.learningActionSource, "AI_TUTOR_RESULT_ARCHIVE");
    assert.equal(result.sourceRead.resultArchiveStatus, "READY_FOR_STUDENT_APP_READ");
    assert.equal(result.renderEnvelope.blocks[1].sectionId, "ai_tutor_answer_section_result_archive_001");
    assert.equal(result.boundary.safeTextBlocksOnly, true);
  });

  it("uses idempotency for replay and rejects conflicting render records", async () => {
    const verificationLogPath = tempLog();
    const first = await verifyStudentAppAITutorResultStudentArchiveRender(baseInput(), options({ verificationLogPath }));
    const replay = await verifyStudentAppAITutorResultStudentArchiveRender(baseInput(), options({ verificationLogPath }));

    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.recordId, first.recordId);

    const changed = baseInput();
    changed.studentArchiveReadReport.runtimeProbes.studentAppAiTutorResultStudentArchiveRead.result.resultArchiveCard.archiveItemId = "tarch_student_ai_tutor_result_other";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(changed, options({ verificationLogPath })),
      /existing.renderEnvelope.archiveItemId/u,
    );
  });

  it("rejects missing port, cross-student principal, and mismatched envelope", async () => {
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(baseInput(), {}),
      /StudentAppAITutorResultStudentArchiveRenderPort must be an object/u,
    );

    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(baseInput(), { studentAppAITutorResultArchiveRenderPort: {} }),
      /renderStudentVisibleArchivedResult is required/u,
    );

    const crossStudent = baseInput();
    crossStudent.principal.studentAccess.ownStudentId = "student_002";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(crossStudent, options()),
      /ownStudentId must be/u,
    );

    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(baseInput(), options({ envelope: { ...renderEnvelope(), archiveItemId: "tarch_other" } })),
      /renderEnvelope.archiveItemId/u,
    );
  });

  it("rejects unsafe result-archive render source metadata", async () => {
    const unsafeSource = resultArchiveInput();
    unsafeSource.studentArchiveReadReport.safetyInvariants.learningActionSourceRequired = "PUBLISHED_MATERIAL";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(unsafeSource, options({ envelope: resultArchiveRenderEnvelope() })),
      /learningActionSourceRequired must be AI_TUTOR_RESULT_ARCHIVE/u,
    );

    const unsafeResult = resultArchiveInput();
    unsafeResult.studentArchiveReadReport.runtimeProbes.studentAppAiTutorResultArchiveStudentArchiveRead.result.sourceRowVerification.resultArchiveStatus = "NOT_READY";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(unsafeResult, options({ envelope: resultArchiveRenderEnvelope() })),
      /resultArchiveStatus must be READY_FOR_STUDENT_APP_READ/u,
    );
  });

  it("rejects unsafe policy, leaked fields, unsafe text, and missing evidence", async () => {
    const unsafePolicy = baseInput();
    unsafePolicy.studentArchiveRenderPolicy.renderedHtmlAllowed = true;
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(unsafePolicy, options()),
      /renderedHtmlAllowed must be false/u,
    );

    const leaked = renderEnvelope();
    leaked.contentRef = "student-ai-tutor-result-archive:raw";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(baseInput(), options({ envelope: leaked })),
      /leaked contentRef/u,
    );

    const unsafeText = renderEnvelope();
    unsafeText.blocks[1].text = "<script>alert(1)</script>";
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(baseInput(), options({ envelope: unsafeText })),
      /unsafe markup/u,
    );

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = [];
    await assert.rejects(
      verifyStudentAppAITutorResultStudentArchiveRender(missingEvidence, options()),
      /source read evidence ref is required/u,
    );
  });
});

function options(overrides = {}) {
  const calls = [];
  return {
    verificationLogPath: overrides.verificationLogPath ?? tempLog(),
    generatedAt: "2026-06-08T15:50:00.000Z",
    studentAppAITutorResultArchiveRenderPort: {
      async renderStudentVisibleArchivedResult(request, context) {
        calls.push({ request, context });
        return {
          found: true,
          source: renderSource(),
          envelope: overrides.envelope ?? renderEnvelope(),
        };
      },
    },
    calls,
  };
}

function baseInput() {
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-render.v1",
    renderInvocationId: "ai_tutor_result_archive_render_runtime_test_001",
    principal: {
      principalId: "student_001",
      sessionId: "sess_student_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
      studentAccess: { mode: "OWN", ownStudentId: "student_001" },
    },
    studentArchiveReadReport: JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-archive-read.current.json", "utf8")),
    studentArchiveRenderPolicy: {
      sourceReadReportRequired: true,
      safeTextBlocksRequired: true,
      injectedStudentResultArchiveRenderPortRequired: true,
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
    },
    evidenceRefs: ["evidence:student-archive-read:student-app-ai-tutor-result-student-archive-read"],
    idempotencyKey: "student-app-ai-tutor-result-archive-render:student_001:tutor_req_student_app_001",
  };
}

function resultArchiveInput() {
  const input = baseInput();
  input.studentArchiveReadReport = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-archive-student-archive-read.current.json", "utf8"));
  input.evidenceRefs = ["evidence:student-app-ai-tutor-result-archive-student-archive-read:http"];
  input.idempotencyKey = "student-app-ai-tutor-result-archive-student-archive-render:student_001:tutor_req_student_app_result_archive_001";
  return input;
}

function renderSource() {
  return {
    endpoint: "GET /v1/student-app/archive-items/{archiveItemId}/ai-tutor-result/rendered",
    useCase: "RenderStudentAppAITutorResultArchive.Execute",
    sourceReadUseCase: "ReadStudentAppAITutorResultArchive.Execute",
    ownStudentOnly: true,
  };
}

function resultArchiveRenderEnvelope() {
  return {
    archiveItemId: "tarch_student_ai_tutor_result_001",
    status: "READY_FOR_STUDENT_APP_READ",
    materialType: "HOMEWORK",
    title: "Student AI Tutor result archive tutor_req_student_app_result_archive_001",
    renderFormat: "SAFE_TEXT_BLOCKS",
    guidanceSectionsHash: "747203bfbeca35e36a136f3998121af114471e4a5c02f51c843a4dfee159292c",
    safetyLabels: ["STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"],
    createdAt: "2026-06-09T13:40:00Z",
    blocks: [
      {
        blockId: "block_summary",
        blockType: "SUMMARY",
        title: "Summary",
        text: "Follow-up help based on a reviewed AI Tutor result.",
      },
      {
        blockId: "block_ai_tutor_answer_section_result_archive_001",
        blockType: "GUIDANCE_SECTION",
        sectionId: "ai_tutor_answer_section_result_archive_001",
        title: "Review the previous correction",
        text: "Restate the corrected reasoning before attempting a similar practice item.",
        sourceBlockRefs: ["source_block_001"],
      },
    ],
  };
}

function renderEnvelope() {
  return {
    archiveItemId: "tarch_student_ai_tutor_result_001",
    status: "READY_FOR_STUDENT_APP_READ",
    materialType: "HOMEWORK",
    title: "Student AI Tutor result archive tutor_req_student_app_001",
    renderFormat: "SAFE_TEXT_BLOCKS",
    guidanceSectionsHash: "05a82687de1587bfc882ecf8ec4f54421da7ff0ab4e911cd0af88d4ffbecec4b",
    safetyLabels: ["NO_DIAGNOSIS", "STUDY_GUIDANCE_ONLY"],
    createdAt: "2026-06-08T12:20:00Z",
    blocks: [
      {
        blockId: "block_summary",
        blockType: "SUMMARY",
        title: "Summary",
        text: "Guided help for comparing fractions.",
      },
      {
        blockId: "block_ai_tutor_answer_section_001",
        blockType: "GUIDANCE_SECTION",
        sectionId: "ai_tutor_answer_section_001",
        title: "Start with a common denominator",
        text: "Convert both fractions to the same denominator, then compare the numerators.",
        sourceBlockRefs: ["block_section_001"],
      },
    ],
  };
}

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-render-")), "render.jsonl");
}
