import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT,
  formatDeepResearchTeacherDelivery,
  recordDeepResearchTeacherDelivery,
} from "./research-deep-research-teacher-delivery-runtime.mjs";

describe("Research deep_research teacher delivery runtime", () => {
  it("records a teacher-only delivery package without publishing to students", () => {
    const result = recordDeepResearchTeacherDelivery(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-teacher-delivery-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_TEACHER_DELIVERY_COMMAND_PORT);
    assert.equal(result.status, "TEACHER_DELIVERY_PACKAGE_READY_NOT_STUDENT_VISIBLE");
    assert.equal(result.teacherDeliveryPackage.claimCount, 2);
    assert.equal(result.teacherDeliveryPackage.citationCount, 2);
    assert.equal(result.teacherDeliveryPackage.sourceHashCount, 2);
    assert.equal(result.teacherDeliveryPackage.claims.length, 2);
    assert.equal(result.boundary.teacherAccessible, true);
    assert.equal(result.boundary.studentVisible, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.requiresFutureStudentDeliveryReview, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:teacher-delivery-input-hash:sha256:/u);
    assert.match(formatDeepResearchTeacherDelivery(result), /Student visible: false/u);
  });

  it("uses idempotency for safe replay and rejects conflicting delivery packages", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchTeacherDelivery(baseInput(), { commandLogPath });
    const second = recordDeepResearchTeacherDelivery(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchTeacherDelivery({
        ...baseInput(),
        teacherDeliveryPackage: { ...teacherDeliveryPackage(), packageId: "different_teacher_delivery_package" },
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unapproved precheck records, unsafe text, students, and service principals", () => {
    assert.throws(
      () => recordDeepResearchTeacherDelivery({
        ...baseInput(),
        publicationPrecheckRecord: {
          ...publicationPrecheckRecord(),
          status: "PUBLICATION_PRECHECK_REVISION_REQUIRED",
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /status must be PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED/u,
    );
    assert.throws(
      () => recordDeepResearchTeacherDelivery({
        ...baseInput(),
        teacherDeliveryPackage: { ...teacherDeliveryPackage(), summary: "<b>unsafe</b>" },
      }, { commandLogPath: tempCommandLogPath() }),
      /must be encoded safe text/u,
    );
    assert.throws(
      () => recordDeepResearchTeacherDelivery({
        ...baseInput(),
        principal: { ...principal(), role: "STUDENT", entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research teacher or admin/u,
    );
    assert.throws(
      () => recordDeepResearchTeacherDelivery({
        ...baseInput(),
        principal: { ...principal(), role: "SERVICE", subjectType: "SERVICE", entryPoint: "AGENT_INTERNAL" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research teacher or admin/u,
    );
  });

  it("rejects student delivery policy, direct publication, DB writes, and mismatched previews", () => {
    assert.throws(
      () => recordDeepResearchTeacherDelivery({
        ...baseInput(),
        deliveryPolicy: { ...deliveryPolicy(), studentVisibleDeliveryAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /studentVisibleDeliveryAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchTeacherDelivery({
        ...baseInput(),
        deliveryPolicy: { ...deliveryPolicy(), mainDatabaseWriteAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /mainDatabaseWriteAllowed must be false/u,
    );
    const mismatched = baseInput();
    mismatched.renderPreviewRecord.preview.previewId = "different_preview";
    assert.throws(
      () => recordDeepResearchTeacherDelivery(mismatched, { commandLogPath: tempCommandLogPath() }),
      /must approve the supplied render preview/u,
    );
    const highRisk = baseInput();
    highRisk.publicationPrecheckRecord.precheck.risk.publicationRisk = "HIGH";
    assert.throws(
      () => recordDeepResearchTeacherDelivery(highRisk, { commandLogPath: tempCommandLogPath() }),
      /HIGH risk/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-teacher-delivery-")), "delivery.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-teacher-delivery.v1",
    deliveryInvocationId: "deep_research_teacher_delivery_inv_001",
    principal: principal(),
    publicationPrecheckRecord: publicationPrecheckRecord(),
    renderPreviewRecord: renderPreviewRecord(),
    deliveryPolicy: deliveryPolicy(),
    teacherDeliveryPackage: teacherDeliveryPackage(),
    evidenceRefs: ["evidence:teacher-delivery:desktop-research", "evidence:publication-precheck:job-001"],
    idempotencyKey: "deep-research-teacher-delivery:job-001",
  };
}

function principal() {
  return {
    principalId: "teacher_research_reviewer_001",
    role: "TEACHER",
    subjectType: "USER",
    entryPoint: "DESKTOP_RESEARCH",
    scopes: ["RESEARCH_READ", "RESEARCH_WRITE", "KNOWLEDGE_PRIVATE_READ"],
    sessionId: "research_teacher_delivery_session_001",
  };
}

function deliveryPolicy() {
  return {
    publicationPrecheckRequired: true,
    renderPreviewRequired: true,
    teacherDeliveryAllowed: true,
    preserveEvidenceRequired: true,
    preserveSourceHashesRequired: true,
    preserveLimitationsRequired: true,
    futureStudentDeliveryReviewRequired: true,
    studentVisibleDeliveryAllowed: false,
    directPublicationAllowed: false,
    directDatabaseAccessAllowed: false,
    mainDatabaseWriteAllowed: false,
    studentArchiveWriteAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function teacherDeliveryPackage() {
  return {
    packageId: "deep_research_teacher_delivery_package_001",
    packageKind: "EVIDENCE_GROUNDED_TEACHER_DELIVERY_PACKAGE",
    audience: "TEACHER_RESEARCH",
    channel: "DESKTOP_RESEARCH",
    format: "SAFE_TEXT_BLOCKS",
    deliveryState: "TEACHER_READY_NOT_STUDENT_VISIBLE",
    title: "个性化学习与智能教研助手的证据草稿",
    summary: "当前证据支持把个性化辅导建立在可追踪的学习档案、检索证据和效果指标上。",
    teacherNotes: "教师可以在科研工作区查看该包，学生可见交付仍需后续审查。",
  };
}

function publicationPrecheckRecord() {
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-publication-precheck.output.example.json", "utf8"));
}

function renderPreviewRecord() {
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-render-preview.output.example.json", "utf8"));
}
