import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT,
  formatTeachingArchiveMaterialPublicationDeliveryEnvelope,
  recordTeachingArchiveMaterialPublicationDeliveryEnvelope,
} from "./teaching-archive-material-publication-delivery-runtime.mjs";

describe("TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope", () => {
  it("records a student-visible material delivery envelope while keeping durable publication blocked", () => {
    const result = recordTeachingArchiveMaterialPublicationDeliveryEnvelope(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-07T09:45:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED");
    assert.equal(result.studentMaterialDeliveryEnvelope.deliveryState, "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED");
    assert.equal(result.studentMaterialDeliveryEnvelope.archiveItemId, "tarch_archive_material_001");
    assert.equal(result.boundary.studentVisibleMaterialDeliveryEnvelopeCreated, true);
    assert.equal(result.boundary.studentVisibleMaterialDelivered, true);
    assert.equal(result.boundary.durablePublicationPersistenceStarted, false);
    assert.equal(result.boundary.publicationCommitted, false);
    assert.equal(result.boundary.ocrOrRagJobWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.runtimeSlo.p99Ms, 7);
    assert.match(formatTeachingArchiveMaterialPublicationDeliveryEnvelope(result), /Persisted: false/u);
  });

  it("uses idempotency for replay and rejects conflicting delivery envelopes", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordTeachingArchiveMaterialPublicationDeliveryEnvelope(baseInput(), { commandLogPath });
    const replay = recordTeachingArchiveMaterialPublicationDeliveryEnvelope(baseInput(), { commandLogPath });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.deliveryInvocationId = "archive_material_publication_delivery_conflict";
    assert.throws(
      () => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(conflicting, { commandLogPath }),
      /record\.inputHash/u,
    );
  });

  it("rejects unsafe principal, unapproved source, delivery mismatch, and missing evidence", () => {
    const teacher = baseInput();
    teacher.principal = {
      principalId: "teacher_001",
      sessionId: "teacher_session_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHING",
      scopes: ["TEACHING_ARCHIVE_REVIEW"],
    };
    assert.throws(() => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(teacher, { commandLogPath: tempCommandLogPath() }), /subjectType must be SERVICE/u);

    const unsafeSource = baseInput();
    unsafeSource.publicationApprovalReport.safetyInvariants.publicationApproved = false;
    assert.throws(() => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(unsafeSource, { commandLogPath: tempCommandLogPath() }), /publicationApproved must be true/u);

    const mismatch = baseInput();
    mismatch.publicationDeliveryRequest.archiveItemId = "tarch_archive_material_other";
    assert.throws(() => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(mismatch, { commandLogPath: tempCommandLogPath() }), /archiveItemId must be tarch_archive_material_001/u);

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:publication-delivery:0309", "evidence:other"];
    assert.throws(() => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(missingEvidence, { commandLogPath: tempCommandLogPath() }), /publication approval evidence ref is required/u);
  });

  it("rejects unsafe policy, leaked fields, unsafe text, and durable publication collapse", () => {
    for (const field of ["durablePublicationCommitAllowed", "mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.publicationDeliveryPolicy[field] = true;
      assert.throws(
        () => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(input, { commandLogPath: tempCommandLogPath() }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leak = baseInput();
    leak.publicationDeliveryRequest.rawContent = "unsafe";
    assert.throws(() => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(leak, { commandLogPath: tempCommandLogPath() }), /rawContent is not allowed/u);

    const unsafeText = baseInput();
    unsafeText.publicationDeliveryRequest.title = "<script>publish</script>";
    assert.throws(() => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(unsafeText, { commandLogPath: tempCommandLogPath() }), /title must be Fractions practice packet/u);

    const durableCollapse = baseInput();
    durableCollapse.publicationApprovalReport.safetyInvariants.publicationCommitted = true;
    assert.throws(() => recordTeachingArchiveMaterialPublicationDeliveryEnvelope(durableCollapse, { commandLogPath: tempCommandLogPath() }), /publicationCommitted must be false/u);
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-delivery-")), "commands.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-delivery.v1",
    deliveryInvocationId: "archive_material_publication_delivery_001",
    principal: {
      principalId: "student_delivery_runtime_001",
      sessionId: "student_delivery_session_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_DELIVERY_RUNTIME",
      scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
    },
    publicationApprovalReport: publicationApprovalReport(),
    publicationDeliveryPolicy: publicationDeliveryPolicy(),
    publicationDeliveryRequest: publicationDeliveryRequest(),
    evidenceRefs: [
      "evidence:publication-approval:0308",
      "evidence:publication-delivery:0309",
    ],
    idempotencyKey: "archive-material-publication-delivery:student_001:fractions_packet",
  };
}

function publicationDeliveryPolicy() {
  return {
    publicationApprovalRequired: true,
    studentDeliveryEnvelopeAllowed: true,
    studentVisibleMaterialAllowed: true,
    studentOwnScopeRequired: true,
    safeMaterialEnvelopeRequired: true,
    futureDurablePublicationPersistenceReviewRequired: true,
    idempotentPublicationDeliveryRequired: true,
    durablePublicationCommitAllowed: false,
    mainDatabaseWriteAllowed: false,
    studentArchiveWriteAllowed: false,
    directDatabaseAccessAllowed: false,
    executeHttpRequestAllowed: false,
    ocrOrRagJobWriteAllowed: false,
    aiGradingWriteAllowed: false,
    modelInferenceAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function publicationDeliveryRequest() {
  return {
    envelopeId: "archive_material_delivery_env_001",
    deliveryMode: "STUDENT_APP_RENDERABLE_ARCHIVE_MATERIAL_ENVELOPE",
    channel: "STUDENT_APP",
    audienceKind: "STUDENT_ARCHIVE_MATERIAL",
    visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_DELIVERY_ENVELOPE_NOT_PERSISTED",
    scopeRef: {
      scopeType: "STUDENT_OWN_ARCHIVE",
      studentId: "student_001",
      archiveItemId: "tarch_archive_material_001",
    },
    approvalRecordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
    approvalId: "archive_material_publication_approval_001",
    publicationCandidateId: "archive_material_pub_precheck_001",
    archiveItemId: "tarch_archive_material_001",
    studentId: "student_001",
    materialType: "HANDOUT",
    title: "Fractions practice packet",
    contentRef: "precommit://archive-material/student_001/fractions-packet",
    studentOwnScopeConfirmed: true,
  };
}

function publicationApprovalReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-approved.v1",
    runtimeId: "teaching_archive_material_publication_approval_runtime",
    commandPort: "TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED",
    recordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
    approvalDecision: { decision: "APPROVED_FOR_PUBLICATION_DELIVERY" },
    approvedPublicationCandidate: {
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
    },
    publicationApproval: {
      approvalId: "archive_material_publication_approval_001",
      reviewerPrincipalId: "teacher_001",
      decision: "APPROVED_FOR_PUBLICATION_DELIVERY",
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
      sourcePublicationPrecheckVerified: true,
      publicationCandidateVerified: true,
      studentOwnScopeReviewed: true,
      sensitiveLeakageReviewed: true,
      futurePublicationDeliveryRuntimeRequired: true,
    },
    boundary: {
      publicationApproved: true,
      approvedForPublicationDelivery: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
      deliveryEnvelopeCreated: false,
    },
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL",
    runtime: {
      runtimeId: "teaching_archive_material_publication_approval_runtime",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationApproval: { result } },
    safetyInvariants: {
      sourcePublicationPrecheckRequired: true,
      physicalDatabaseRowVerified: true,
      humanPublicationPrecheckRecorded: true,
      publicationApproved: true,
      approvedForPublicationDelivery: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
      deliveryEnvelopeCreated: false,
      mainDatabaseWriteStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}
