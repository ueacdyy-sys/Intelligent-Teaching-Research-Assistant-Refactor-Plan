import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT,
  formatTeachingArchiveMaterialPublicationPrecheck,
  recordTeachingArchiveMaterialPublicationPrecheck,
} from "./teaching-archive-material-publication-precheck-runtime.mjs";

describe("TeachingArchiveMaterialPublicationPrecheckPort.recordTeachingArchiveMaterialPublicationPrecheck", () => {
  it("records a precheck-only publication candidate from 0306 student product read evidence", () => {
    const result = recordTeachingArchiveMaterialPublicationPrecheck(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-07T08:45:00.000Z",
      probeP99Ms: 7,
    });

    assert.equal(result.commandPort, TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_PORT);
    assert.equal(result.status, "TEACHING_ARCHIVE_MATERIAL_PUBLICATION_PRECHECK_READY");
    assert.equal(result.precheckDecision.decision, "READY_FOR_PUBLICATION_APPROVAL");
    assert.equal(result.publicationCandidate.archiveItemId, "tarch_archive_material_001");
    assert.equal(result.boundary.humanPublicationPrecheckRecorded, true);
    assert.equal(result.boundary.publicationCommitted, false);
    assert.equal(result.boundary.studentVisiblePublished, false);
    assert.equal(result.boundary.ocrOrRagJobWriteStarted, false);
    assert.equal(result.boundary.modelInferenceStarted, false);
    assert.equal(result.runtimeSlo.p99Ms, 7);
    assert.match(formatTeachingArchiveMaterialPublicationPrecheck(result), /Published: false/u);
  });

  it("uses idempotency for replay and rejects conflicting publication prechecks", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordTeachingArchiveMaterialPublicationPrecheck(baseInput(), { commandLogPath });
    const replay = recordTeachingArchiveMaterialPublicationPrecheck(baseInput(), { commandLogPath });

    assert.equal(first.recordId, replay.recordId);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);

    const conflicting = baseInput();
    conflicting.precheckInvocationId = "archive_material_publication_precheck_conflict";
    assert.throws(
      () => recordTeachingArchiveMaterialPublicationPrecheck(conflicting, { commandLogPath }),
      /record\.inputHash/u,
    );
  });

  it("rejects forbidden principal, unsafe source report, candidate mismatch, and missing evidence", () => {
    const student = baseInput();
    student.principal = {
      principalId: "student_001",
      sessionId: "student_session_001",
      subjectType: "USER",
      role: "STUDENT",
      entryPoint: "STUDENT_APP",
      scopes: ["STUDENT_OWN_READ"],
    };
    assert.throws(() => recordTeachingArchiveMaterialPublicationPrecheck(student, { commandLogPath: tempCommandLogPath() }), /role must be one of/u);

    const unsafeSource = baseInput();
    unsafeSource.productReadReport.safetyInvariants.publicationAllowed = true;
    assert.throws(() => recordTeachingArchiveMaterialPublicationPrecheck(unsafeSource, { commandLogPath: tempCommandLogPath() }), /publicationAllowed must be false/u);

    const mismatch = baseInput();
    mismatch.publicationCandidate.archiveItemId = "tarch_archive_material_other";
    assert.throws(() => recordTeachingArchiveMaterialPublicationPrecheck(mismatch, { commandLogPath: tempCommandLogPath() }), /archiveItemId must be tarch_archive_material_001/u);

    const missingEvidence = baseInput();
    missingEvidence.evidenceRefs = ["evidence:publication-precheck:0307", "evidence:other"];
    assert.throws(() => recordTeachingArchiveMaterialPublicationPrecheck(missingEvidence, { commandLogPath: tempCommandLogPath() }), /student product read evidence ref is required/u);
  });

  it("rejects unsafe policy, leaked fields, unsafe text, and future-work collapse", () => {
    for (const field of ["directPublicationAllowed", "studentVisibleDeliveryAllowed", "mainDatabaseWriteAllowed", "directDatabaseAccessAllowed", "executeHttpRequestAllowed", "ocrOrRagJobWriteAllowed", "aiGradingWriteAllowed", "modelInferenceAllowed", "swarmAllowed"]) {
      const input = baseInput();
      input.publicationPrecheckPolicy[field] = true;
      assert.throws(
        () => recordTeachingArchiveMaterialPublicationPrecheck(input, { commandLogPath: tempCommandLogPath() }),
        new RegExp(`${field} must be false`, "u"),
      );
    }

    const leak = baseInput();
    leak.publicationCandidate.rawModelOutput = "unsafe";
    assert.throws(() => recordTeachingArchiveMaterialPublicationPrecheck(leak, { commandLogPath: tempCommandLogPath() }), /rawModelOutput is not allowed/u);

    const unsafeText = baseInput();
    unsafeText.publicationCandidate.reviewNotes = "<script>publish</script>";
    assert.throws(() => recordTeachingArchiveMaterialPublicationPrecheck(unsafeText, { commandLogPath: tempCommandLogPath() }), /contains unsafe text/u);

    const futureWork = baseInput();
    futureWork.publicationCandidate.ragEnrichmentRequested = true;
    assert.throws(() => recordTeachingArchiveMaterialPublicationPrecheck(futureWork, { commandLogPath: tempCommandLogPath() }), /ragEnrichmentRequested must be false/u);
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "teaching-archive-material-publication-precheck-")), "commands.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-07.teaching.archive-material-publication-precheck.v1",
    precheckInvocationId: "archive_material_publication_precheck_001",
    principal: {
      principalId: "teacher_001",
      sessionId: "teacher_session_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHING",
      scopes: ["TEACHING_ARCHIVE_READ", "TEACHING_ARCHIVE_REVIEW"],
    },
    productReadReport: productReadReport(),
    publicationPrecheckPolicy: publicationPrecheckPolicy(),
    publicationCandidate: publicationCandidate(),
    evidenceRefs: [
      "evidence:student-product-read:0306",
      "evidence:publication-precheck:0307",
    ],
    idempotencyKey: "archive-material-publication-precheck:student_001:fractions_packet",
  };
}

function publicationPrecheckPolicy() {
  return {
    precheckOnly: true,
    sourceStudentProductReadRequired: true,
    physicalRowVerificationRequired: true,
    humanPublicationPrecheckRequired: true,
    noSensitiveLeakageRequired: true,
    futurePublicationApprovalRequired: true,
    idempotentPublicationPrecheckRequired: true,
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

function publicationCandidate() {
  return {
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
  };
}

function productReadReport() {
  const result = {
    schemaVersion: "2026-06-07.teaching.archive-material-draft-student-product-read-verified.v1",
    runtimeId: "teaching_archive_material_draft_student_product_read_runtime",
    commandPort: "TeachingArchiveMaterialDraftStudentProductReadPort.verifyStudentAppArchiveItemsRead",
    status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED",
    recordId: "teaching_archive_material_draft_student_product_read_archive-material-draft-student-product-read_student_001_fractions_packet",
    studentProductReadSource: { endpoint: "GET /v1/student-app/archive-items" },
    studentProductArchiveItem: {
      id: "tarch_archive_material_001",
      ownerType: "STUDENT",
      studentId: "student_001",
      materialType: "HANDOUT",
      title: "Fractions practice packet",
      contentRef: "precommit://archive-material/student_001/fractions-packet",
    },
    boundary: {
      ownStudentProductReadVerified: true,
      publicationAllowed: false,
      modelInferenceStarted: false,
    },
  };
  return {
    readiness: "READY",
    workloadType: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ",
    runtime: {
      runtimeId: "teaching_archive_material_draft_student_product_read_runtime",
      status: "TEACHING_ARCHIVE_MATERIAL_DRAFT_STUDENT_PRODUCT_READ_VERIFIED",
    },
    runtimeSlo: { p99Ms: 7, totalErrors: 0 },
    runtimeProbes: { teachingArchiveMaterialDraftStudentProductRead: { result } },
    safetyInvariants: {
      storageRowVerificationRequired: true,
      physicalDatabaseRowVerified: true,
      studentAppArchiveItemsEndpointVerified: true,
      ownStudentProductReadVerified: true,
      productResponseMatchedPhysicalRow: true,
      crossStudentLeakPrevented: true,
      teachingMaterialLeakPrevented: true,
      requiresFuturePublicationOrRagSlice: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      ocrOrRagJobWriteStarted: false,
      aiGradingWriteStarted: false,
      modelInferenceStarted: false,
      publicationAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
  };
}
