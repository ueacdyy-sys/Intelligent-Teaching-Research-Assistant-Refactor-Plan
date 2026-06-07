import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT,
  formatTeachingArchiveMaterialPublicationApproval,
  recordTeachingArchiveMaterialPublicationApproval,
} from "./teaching-archive-material-publication-approval-runtime.mjs";

describe("TeachingArchiveMaterialPublicationApprovalPort.recordTeachingArchiveMaterialPublicationApproval", () => {
  it("records an approval-only publication decision from 0307 precheck evidence", () => {
    const result = recordTeachingArchiveMaterialPublicationApproval(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-07T09:15:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVAL_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_APPROVED_NOT_PUBLISHED");
    assert.equal(result.approvalDecision.decision, "APPROVED_FOR_PUBLICATION_DELIVERY");
    assert.equal(result.approvedPublicationCandidate.archiveItemId, "tarch_archive_material_001");
    assert.equal(result.boundary.publicationApproved, true);
    assert.equal(result.boundary.approvedForPublicationDelivery, true);
    assert.equal(result.boundary.publicationCommitted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.ocrOrRagJobWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.runtimeSlo.p99Ms, 7);
    assert.match(formatTeachingArchiveMaterialPublicationApproval(result), /Published: false/u);
  });

  it("uses idempotency for replay and rejects conflicting publication approvals", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordTeachingArchiveMaterialPublicationApproval(baseInput(), { commandLogPath });
    const replay = recordTeachingArchiveMaterialPublicationApproval(baseInput(), { commandLogPath });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.approvalInvocationId = "archive_material_publication_approval_conflict";
    assert.throws(
      () => recordTeachingArchiveMaterialPublicationApproval(conflicting, { commandLogPath }),
      /record\.inputHash/u,
    );
  });

  it("rejects forbidden principal, unsafe source precheck, approval mismatch, and missing evidence", () => {
    const student = baseInput();
    student.principal = {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
    };
    assert.throws(() => recordTeachingArchiveMaterialPublicationApproval(student, { commandLogPath: tempCommandLogPath() }), /role must be one of/u);

    const unsafeSource = baseInput();
    unsafeSource.publicationPrecheckReport.safetyInvariants.studentVisiblePublished = true;
    assert.throws(() => recordTeachingArchiveMaterialPublicationApproval(unsafeSource, { commandLogPath: tempCommandLogPath() }), /studentVisiblePublished must be false/u);

    const mismatch = baseInput();
    mismatch.publicationApproval.archiveItemId = "tarch_archive_material_other";
    assert.throws(() => recordTeachingArchiveMaterialPublicationApproval(mismatch, { commandLogPath: tempCommandLogPath() }), /archiveItemId must be tarch_archive_material_001/u);

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:publication-approval:0308", "evidence:other"];
    assert.throws(() => recordTeachingArchiveMaterialPublicationApproval(missingEvidence, { commandLogPath: tempCommandLogPath() }), /publication precheck evidence ref is required/u);
  });

  it("rejects unsafe policy, leaked fields, unsafe text, and delivery collapse", () => {
    for (const field of ["directPublicationAllowed", "studentVisibleDeliveryAllowed", "mainDatabaseWriteAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.publicationApprovalPolicy[field] = true;
      assert.throws(
        () => recordTeachingArchiveMaterialPublicationApproval(input, { commandLogPath: tempCommandLogPath() }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leak = baseInput();
    leak.publicationApproval.rawModelOutput = "unsafe";
    assert.throws(() => recordTeachingArchiveMaterialPublicationApproval(leak, { commandLogPath: tempCommandLogPath() }), /rawModelOutput is not allowed/u);

    const unsafeText = baseInput();
    unsafeText.publicationApproval.approvalNotes = "<script>publish</script>";
    assert.throws(() => recordTeachingArchiveMaterialPublicationApproval(unsafeText, { commandLogPath: tempCommandLogPath() }), /contains unsafe text/u);

    const deliveryCollapse = baseInput();
    deliveryCollapse.publicationApproval.studentVisiblePublished = true;
    assert.throws(() => recordTeachingArchiveMaterialPublicationApproval(deliveryCollapse, { commandLogPath: tempCommandLogPath() }), /studentVisiblePublished must be false/u);
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-approval-")), "commands.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-approval.v1",
    approvalInvocationId: "archive_material_publication_approval_001",
    principal: {
      principalId: "teacher_001",
      sessionId: "teacher_session_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHING",
      scopes: ["TEACHING_ARCHIVE_REVIEW", "TEACHING_ARCHIVE_PUBLISH_APPROVE"],
    },
    publicationPrecheckReport: publicationPrecheckReport(),
    publicationApprovalPolicy: publicationApprovalPolicy(),
    publicationApproval: publicationApproval(),
    evidenceRefs: [
      "evidence:publication-precheck:0307",
      "evidence:publication-approval:0308",
    ],
    idempotencyKey: "archive-material-publication-approval:student_001:fractions_packet",
  };
}

function publicationApprovalPolicy() {
  return {
    approvalOnly: true,
    sourcePublicationPrecheckRequired: true,
    humanPublicationApprovalRequired: true,
    candidateMatchRequired: true,
    noSensitiveLeakageRequired: true,
    futurePublicationDeliveryRuntimeRequired: true,
    idempotentPublicationApprovalRequired: true,
    directPublicationAllowed: false,
    studentVisibleDeliveryAllowed: false,
    mainDatabaseWriteAllowed: false,
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

function publicationApproval() {
  return {
    approvalId: "archive_material_publication_approval_001",
    reviewerPrincipalId: "teacher_001",
    decision: "APPROVED_FOR_PUBLICATION_DELIVERY",
    approvedAt: "2026-06-07T09:15:00.000Z",
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
    approvalNotes: "Teacher approved the reviewed material for a later delivery runtime.",
    publicationCommitted: false,
    studentVisiblePublished: false,
    deliveryEnvelopeCreated: false,
    mainDatabaseWriteApproved: false,
    ocrOrRagJobApproved: false,
    aiGradingApproved: false,
    modelInferenceApproved: false,
    remoteDeviceControlApproved: false,
    localToolMutationApproved: false,
    swarmApproved: false,
  };
}

function publicationPrecheckReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-prechecked.v1",
    runtimeId: "teaching_archive_material_publication_precheck_runtime",
    commandPort: "TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck",
    status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY",
    recordId: "teaching_archive_material_publication_precheck_archive-material-publication-precheck-student_001-fractions_packet",
    precheckDecision: { decision: "READY_FOR_PUBLICATION_APPROVAL" },
    publicationCandidate: {
      publicationCandidateId: "archive_material_pub_precheck_001",
      archiveItemId: "tarch_archive_material_001",
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
      publicationTarget: "TEACHER_PUBLICATION_APPROVAL_QUEUE",
      intendedAudience: ["TEACHER_REVIEW"],
      studentVisibleRequested: false,
      ocrEnrichmentRequested: false,
      ragEnrichmentRequested: false,
      aiGradingRequested: false,
      releaseChannel: "NONE_PRECHECK_ONLY",
      reviewNotes: "Teacher precheck recorded for later publication approval.",
      riskTags: ["HUMAN_APPROVAL_REQUIRED"],
    },
    boundary: {
      humanPublicationPrecheckRecorded: true,
      publicationApprovalRequired: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
    },
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK",
    runtime: {
      runtimeId: "teaching_archive_material_publication_precheck_runtime",
      status: "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY",
    },
    runtimeSlo: { p99Ms: 6, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialPublicationPrecheck: { result } },
    safetyInvariants: {
      sourceStudentProductReadRequired: true,
      physicalDatabaseRowVerified: true,
      humanPublicationPrecheckRecorded: true,
      publicationApprovalRequired: true,
      publicationCommitted: false,
      studentVisiblePublished: false,
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
