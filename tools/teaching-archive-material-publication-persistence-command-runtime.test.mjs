import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT,
  formatTeachingArchiveMaterialPublicationPersistenceCommand,
  recordTeachingArchiveMaterialPublicationPersistenceCommand,
} from "./teaching-archive-material-publication-persistence-command-runtime.mjs";

describe("TeachingArchiveMaterialPublicationPersistenceCommandPort.recordTeachingArchiveMaterialPublicationPersistenceCommand", () => {
  it("records an append-only publication persistence command without durable commit", () => {
    const result = recordTeachingArchiveMaterialPublicationPersistenceCommand(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-07T10:10:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED");
    assert.equal(result.publicationPersistenceCommand.commandState, "NOT_COMMITTED_TO_PUBLICATION_STORE");
    assert.equal(result.publicationPersistenceCommand.archiveItemId, "tarch_archive_material_001");
    assert.equal(result.boundary.publicationPersistenceCommandRecorded, true);
    assert.equal(result.boundary.appendOnlyCommandLogRecorded, true);
    assert.equal(result.boundary.publicationCommitted, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.ocrOrRagJobWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.runtimeSlo.p99Ms, 7);
    assert.equal(new Set(result.evidenceRefs).size, result.evidenceRefs.length);
    assert.match(formatTeachingArchiveMaterialPublicationPersistenceCommand(result), /Committed: false/u);
  });

  it("uses idempotency for replay and rejects conflicting persistence commands", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordTeachingArchiveMaterialPublicationPersistenceCommand(baseInput(), { commandLogPath });
    const replay = recordTeachingArchiveMaterialPublicationPersistenceCommand(baseInput(), { commandLogPath });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.persistenceInvocationId = "archive_material_publication_persist_conflict";
    assert.throws(
      () => recordTeachingArchiveMaterialPublicationPersistenceCommand(conflicting, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe principal, unsafe delivery report, request mismatch, and missing evidence", () => {
    const teacher = baseInput();
    teacher.principal = {
      principalId: "teacher_001",
      sessionId: "teacher_session_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHING",
      scopes: ["TEACHING_ARCHIVE_REVIEW"],
    };
    assert.throws(() => recordTeachingArchiveMaterialPublicationPersistenceCommand(teacher, { commandLogPath: tempCommandLogPath() }), /subjectType must be SERVICE/u);

    const unsafeSource = baseInput();
    unsafeSource.publicationDeliveryEnvelopeReport.safetyInvariants.studentVisibleMaterialDelivered = false;
    assert.throws(() => recordTeachingArchiveMaterialPublicationPersistenceCommand(unsafeSource, { commandLogPath: tempCommandLogPath() }), /studentVisibleMaterialDelivered must be true/u);

    const mismatch = baseInput();
    mismatch.publicationPersistenceRequest.archiveItemId = "tarch_archive_material_other";
    assert.throws(() => recordTeachingArchiveMaterialPublicationPersistenceCommand(mismatch, { commandLogPath: tempCommandLogPath() }), /archiveItemId must be tarch_archive_material_001/u);

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:publication-persistence-command:0310", "evidence:other"];
    assert.throws(() => recordTeachingArchiveMaterialPublicationPersistenceCommand(missingEvidence, { commandLogPath: tempCommandLogPath() }), /publication delivery evidence ref is required/u);
  });

  it("rejects unsafe policy, leaked fields, unsafe text, and durable publication collapse", () => {
    for (const field of ["durablePublicationCommitAllowed", "mainDatabaseWriteAllowed", "studentArchiveWriteAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.publicationPersistencePolicy[field] = true;
      assert.throws(
        () => recordTeachingArchiveMaterialPublicationPersistenceCommand(input, { commandLogPath: tempCommandLogPath() }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leak = baseInput();
    leak.publicationPersistenceRequest.databaseWriteResult = "unsafe";
    assert.throws(() => recordTeachingArchiveMaterialPublicationPersistenceCommand(leak, { commandLogPath: tempCommandLogPath() }), /databaseWriteResult is not allowed/u);

    const unsafeText = baseInput();
    const envelope = unsafeText.publicationDeliveryEnvelopeReport.runtimeProbes.teachingArchiveMaterialPublicationDelivery.result.studentMaterialDeliveryEnvelope;
    envelope.title = "<script>publish</script>";
    unsafeText.publicationPersistenceRequest.title = "<script>publish</script>";
    assert.throws(() => recordTeachingArchiveMaterialPublicationPersistenceCommand(unsafeText, { commandLogPath: tempCommandLogPath() }), /title contains unsafe text/u);

    const durableCollapse = baseInput();
    durableCollapse.publicationDeliveryEnvelopeReport.safetyInvariants.publicationCommitted = true;
    assert.throws(() => recordTeachingArchiveMaterialPublicationPersistenceCommand(durableCollapse, { commandLogPath: tempCommandLogPath() }), /publicationCommitted must be false/u);
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-persistence-command-")), "commands.jsonl");
}

function baseInput() {
  const report = publicationDeliveryReport();
  const envelope = report.runtimeProbes.teachingArchiveMaterialPublicationDelivery.result.studentMaterialDeliveryEnvelope;
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-persistence-command.v1",
    persistenceInvocationId: "archive_material_publication_persist_001",
    principal: {
      principalId: "publication_persistence_command_runtime_001",
      sessionId: "publication_persistence_session_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "PUBLICATION_PERSISTENCE_COMMAND_RUNTIME",
      scopes: ["TEACHING_READ", "PUBLICATION_PERSISTENCE_COMMAND", "STUDENT_ARCHIVE_WRITE_INTENT"],
    },
    publicationDeliveryEnvelopeReport: report,
    publicationPersistencePolicy: publicationPersistencePolicy(),
    publicationPersistenceRequest: {
      commandId: "archive_material_publication_persist_cmd_001",
      persistenceMode: "APPEND_ONLY_PUBLICATION_PERSISTENCE_COMMAND",
      targetPublicationKind: "STUDENT_ARCHIVE_MATERIAL",
      desiredPublicationState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      scopeRef: envelope.scopeRef,
      deliveryEnvelopeRecordId: "teaching_archive_material_publication_delivery_archive-material-publication-delivery-student_001-fractions_packet",
      deliveryEnvelopeId: envelope.envelopeId,
      approvalRecordId: envelope.approvalRecordId,
      approvalId: envelope.approvalId,
      publicationCandidateId: envelope.publicationCandidateId,
      archiveItemId: envelope.archiveItemId,
      studentId: envelope.studentId,
      materialType: envelope.materialType,
      title: envelope.title,
      contentRef: envelope.contentRef,
    },
    evidenceRefs: ["evidence:publication-delivery:0309", "evidence:publication-persistence-command:0310"],
    idempotencyKey: "archive-material-publication-persistence-command:student_001:fractions_packet",
  };
}

function publicationPersistencePolicy() {
  return {
    publicationDeliveryEnvelopeRequired: true,
    appendOnlyCommandLogRequired: true,
    studentOwnScopeRequired: true,
    preserveApprovalEvidenceRequired: true,
    preserveMaterialPointerRequired: true,
    futureDurablePublicationCommitReviewRequired: true,
    idempotentPersistenceCommandRequired: true,
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

function publicationDeliveryReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-delivery-envelope.v1",
    runtimeId: "teaching_archive_material_publication_delivery_runtime",
    commandPort: "TeachingArchiveMaterialPublicationDeliveryPort.recordTeachingArchiveMaterialPublicationDeliveryEnvelope",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
    recordId: "teaching_archive_material_publication_delivery_archive-material-publication-delivery-student_001-fractions_packet",
    deliveryInvocationId: "archive_material_publication_delivery_001",
    sourcePublicationApproval: {
      runtimeId: "teaching_archive_material_publication_approval_runtime",
      recordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
      approvalId: "archive_material_publication_approval_001",
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
    },
    studentMaterialDeliveryEnvelope: {
      envelopeId: "archive_material_delivery_env_001",
      deliveryState: "READY_FOR_STUDENT_APP_MATERIAL_RENDER_NOT_ARCHIVED",
      visibilityState: "STUDENT_VISIBLE_ARCHIVE_MATERIAL_DELIVERY_ENVELOPE_NOT_PERSISTED",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_ARCHIVE_MATERIAL",
      scopeRef: { scopeType: "STUDENT_OWN_ARCHIVE", studentId: "student_001", archiveItemId: "tarch_archive_material_001" },
      approvalRecordId: "teaching_archive_material_publication_approval_archive-material-publication-approval-student_001-fractions_packet",
      approvalId: "archive_material_publication_approval_001",
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
      durablePublicationPersistenceStarted: false,
      publicationCommitted: false,
      requiresFutureDurablePublicationPersistenceReview: true,
    },
    boundary: {
      studentVisibleMaterialDeliveryEnvelopeCreated: true,
      studentVisibleMaterialDelivered: true,
      durablePublicationPersistenceStarted: false,
      publicationCommitted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
    },
    evidenceRefs: ["evidence:publication-approval:0308", "evidence:publication-delivery:0309"],
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY",
    runtime: { runtimeId: "teaching_archive_material_publication_delivery_runtime", status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationDelivery: { result } },
    safetyInvariants: {
      publicationApprovalRequired: true,
      publicationApprovalVerified: true,
      studentDeliveryEnvelopeAllowed: true,
      safeMaterialEnvelopeOnly: true,
      studentOwnScopeEnforced: true,
      studentVisibleMaterialDeliveryEnvelopeCreated: true,
      studentVisibleMaterialDelivered: true,
      durablePublicationPersistenceStarted: false,
      publicationCommitted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureDurablePublicationPersistenceReviewRequired: true,
    },
  };
}
