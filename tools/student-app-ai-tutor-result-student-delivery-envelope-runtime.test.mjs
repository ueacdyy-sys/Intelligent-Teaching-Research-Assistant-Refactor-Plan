import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT,
  formatStudentAppAITutorResultStudentDeliveryEnvelope,
  recordStudentAppAITutorResultStudentDeliveryEnvelope,
} from "./student-app-ai-tutor-result-student-delivery-envelope-runtime.mjs";

describe("Student App AI Tutor result student delivery envelope runtime", () => {
  it("records a student-visible AI Tutor result envelope while keeping durable persistence blocked", async () => {
    const port = deliveryPort();
    const result = await recordStudentAppAITutorResultStudentDeliveryEnvelope(baseInput(), {
      resultStudentDeliveryEnvelopePort: port,
      commandLogPath: tempLog(),
      generatedAt: "2026-06-08T11:10:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-08.student-app.ai-tutor-result-student-delivery-envelope-recorded.v1");
    assert.equal(result.commandPort, STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT);
    assert.equal(result.status, "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED");
    assert.equal(result.studentResultDeliveryEnvelope.deliveryState, "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED");
    assert.equal(result.boundary.studentDeliveryEnvelopeCreated, true);
    assert.equal(result.boundary.studentVisiblePublished, true);
    assert.equal(result.boundary.durableStudentArchivePersistenceStarted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.studentArchiveWriteStarted, false);
    assert.equal(result.boundary.resultRefDisclosed, false);
    assert.equal(port.calls.length, 1);
    assert.equal(JSON.stringify(port.calls[0]).includes("Convert both fractions"), true);
    assert.equal(JSON.stringify(port.calls[0]).includes("resultRefHash"), false);
    assert.equal(port.calls[0].safety.rawResultRefSentToPort, false);
    assert.match(formatStudentAppAITutorResultStudentDeliveryEnvelope(result), /Student visible: true/u);
  });

  it("uses idempotency for replay and rejects conflicting delivery envelopes", async () => {
    const commandLogPath = tempLog();
    const port = deliveryPort();
    const first = await recordStudentAppAITutorResultStudentDeliveryEnvelope(baseInput(), {
      resultStudentDeliveryEnvelopePort: port,
      commandLogPath,
    });
    const replay = await recordStudentAppAITutorResultStudentDeliveryEnvelope(baseInput(), {
      resultStudentDeliveryEnvelopePort: port,
      commandLogPath,
    });

    assert.equal(first.idempotentReplay, false);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(port.calls.length, 1);

    const conflicting = baseInput();
    conflicting.studentDeliveryRequest.envelopeId = "ai_tutor_result_delivery_env_conflict";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(conflicting, {
        resultStudentDeliveryEnvelopePort: port,
        commandLogPath,
      }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe principals, non-ready sources, unapproved visibility, and hash mismatches", async () => {
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(baseInput(), { commandLogPath: tempLog() }),
      /delivery envelope port is required/u,
    );

    const unsafePrincipal = baseInput();
    unsafePrincipal.principal.role = "STUDENT";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(unsafePrincipal, {
        resultStudentDeliveryEnvelopePort: deliveryPort(),
        commandLogPath: tempLog(),
      }),
      /role must be SERVICE/u,
    );

    const notReady = baseInput();
    notReady.studentVisibilityReviewReport.readiness = "NEEDS_REMEDIATION";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(notReady, {
        resultStudentDeliveryEnvelopePort: deliveryPort(),
        commandLogPath: tempLog(),
      }),
      /readiness must be READY/u,
    );

    const notApproved = baseInput();
    notApproved.studentVisibilityReviewReport.runtimeProbes.studentAppAiTutorResultStudentVisibilityReview.result.studentVisibilityReview.status = "REJECTED";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(notApproved, {
        resultStudentDeliveryEnvelopePort: deliveryPort(),
        commandLogPath: tempLog(),
      }),
      /status must be AI_TUTOR_RESULT_STUDENT_VISIBILITY_APPROVED_NOT_DELIVERED/u,
    );

    const hashMismatch = baseInput();
    hashMismatch.controlledAnswerArtifactReport.runtimeProbes.studentAppAiTutorControlledAnswerArtifact.result.controlledAnswerArtifact.guidanceSections[0].text = "Changed safe text.";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(hashMismatch, {
        resultStudentDeliveryEnvelopePort: deliveryPort(),
        commandLogPath: tempLog(),
      }),
      /guidanceSectionsHash must be/u,
    );
  });

  it("rejects unsafe policies, delivery mismatches, leaked fields, unsafe text, and unsafe port results", async () => {
    for (const field of ["directDatabaseAccessAllowed", "mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "durableArchivePersistenceAllowed", "executeHttpRequestAllowed", "modelInferenceAllowed", "retrievalAllowed", "answerKeyDisclosureAllowed", "rawModelOutputDisclosureAllowed", "resultRefDisclosureAllowed", "promptDisclosureAllowed", "contentRefDisclosureAllowed", "localToolMutationAllowed", "swarmAllowed"]) {
      const unsafe = baseInput();
      unsafe.studentDeliveryPolicy[field] = true;
      await assert.rejects(
        () => recordStudentAppAITutorResultStudentDeliveryEnvelope(unsafe, {
          resultStudentDeliveryEnvelopePort: deliveryPort(),
          commandLogPath: tempLog(),
        }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const mismatch = baseInput();
    mismatch.studentDeliveryRequest.requestId = "tutor_req_other";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(mismatch, {
        resultStudentDeliveryEnvelopePort: deliveryPort(),
        commandLogPath: tempLog(),
      }),
      /requestId must be tutor_req_student_app_001/u,
    );

    const leaked = baseInput();
    leaked.studentDeliveryRequest.resultRef = "reviewed-ai-tutor-result://raw";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(leaked, {
        resultStudentDeliveryEnvelopePort: deliveryPort(),
        commandLogPath: tempLog(),
      }),
      /resultRef is not allowed/u,
    );

    const unsafeText = baseInput();
    unsafeText.controlledAnswerArtifactReport.runtimeProbes.studentAppAiTutorControlledAnswerArtifact.result.controlledAnswerArtifact.guidanceSections[0].text = "This exposes the answer key.";
    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(unsafeText, {
        resultStudentDeliveryEnvelopePort: deliveryPort(),
        commandLogPath: tempLog(),
      }),
      /unsafe student text/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(baseInput(), {
        resultStudentDeliveryEnvelopePort: deliveryPort({ durableStudentArchivePersistenceStarted: true }),
        commandLogPath: tempLog(),
      }),
      /durableStudentArchivePersistenceStarted must be false/u,
    );

    await assert.rejects(
      () => recordStudentAppAITutorResultStudentDeliveryEnvelope(baseInput(), {
        resultStudentDeliveryEnvelopePort: deliveryPort({ resultRef: "reviewed-ai-tutor-result://raw" }),
        commandLogPath: tempLog(),
      }),
      /resultRef is not allowed/u,
    );
  });
});

function tempLog() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-delivery-envelope-")), "delivery.jsonl");
}

function baseInput() {
  const visibility = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-result-student-visibility-review.current.json", "utf8"));
  const artifact = JSON.parse(fs.readFileSync("reports/student-app-ai-tutor-controlled-answer-artifact.current.json", "utf8"));
  const visibilityResult = visibility.runtimeProbes.studentAppAiTutorResultStudentVisibilityReview.result;
  const source = visibilityResult.sourceReviewedResult;
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-delivery-envelope.v1",
    deliveryInvocationId: "ai_tutor_result_student_delivery_001",
    studentVisibilityReviewReport: visibility,
    controlledAnswerArtifactReport: artifact,
    principal: {
      principalId: "student_delivery_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_DELIVERY_RUNTIME",
      sessionId: "session_student_delivery_result_001",
      scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
    },
    studentDeliveryRequest: {
      envelopeId: "ai_tutor_result_delivery_env_001",
      deliveryMode: "STUDENT_APP_RENDERABLE_AI_TUTOR_RESULT_ENVELOPE",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
      visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED",
      scopeRef: "student:student_001",
      studentVisibilityReviewRecordId: visibilityResult.recordId,
      studentVisibilityReviewId: visibilityResult.studentVisibilityReview.reviewId,
      persistenceRecordId: source.persistenceRecordId,
      artifactId: source.artifactId,
      requestId: source.requestId,
      archiveItemId: source.archiveItemId,
      guidanceSectionsHash: source.guidanceSectionsHash,
      studentOwnScopeConfirmed: true,
    },
    studentDeliveryPolicy: {
      studentVisibilityReviewRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleEnvelopeAllowed: true,
      safeGuidanceOnlyRequired: true,
      studentOwnScopeRequired: true,
      futureDurableArchivePersistenceReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      durableArchivePersistenceAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:student-visibility-review:student-app-ai-tutor-result-student-visibility-review",
      "evidence:controlled-answer-artifact:student-app-ai-tutor-controlled-answer-artifact",
    ],
    idempotencyKey: "student-app-ai-tutor-result-student-delivery-envelope:ai_tutor_result_visibility_review_001",
  };
}

function deliveryPort(overrides = {}) {
  const calls = [];
  return {
    calls,
    async recordResultStudentDeliveryEnvelope(request) {
      calls.push(request);
      return {
        studentResultDeliveryEnvelope: {
          envelopeId: request.deliveryRequest.envelopeId,
          studentVisibilityReviewRecordId: request.deliveryRequest.studentVisibilityReviewRecordId,
          studentVisibilityReviewId: request.deliveryRequest.studentVisibilityReviewId,
          artifactId: request.deliveryRequest.artifactId,
          requestId: request.deliveryRequest.requestId,
          archiveItemId: request.deliveryRequest.archiveItemId,
          guidanceSectionsHash: request.deliveryRequest.guidanceSectionsHash,
          visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED",
          deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
          studentVisiblePublished: true,
          durableStudentArchivePersistenceStarted: false,
          mainDatabaseWriteStarted: false,
          studentArchiveWriteStarted: false,
          resultRefDisclosed: false,
          ...overrides,
        },
      };
    },
  };
}
