import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT,
  formatDeepResearchPublicationPrecheck,
  recordDeepResearchPublicationPrecheck,
} from "./research-deep-research-publication-precheck-runtime.mjs";

describe("Research deep_research publication precheck runtime", () => {
  it("records an approved publication precheck without delivering to students", () => {
    const result = recordDeepResearchPublicationPrecheck(baseInput(), {
      commandLogPath: tempCommandLogPath(),
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(result.schemaVersion, "2026-06-05.research.deep-research-publication-precheck-recorded.v1");
    assert.equal(result.commandPort, RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT);
    assert.equal(result.status, "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED");
    assert.equal(result.precheck.approvedForFutureDelivery, true);
    assert.equal(result.precheck.claimCount, 2);
    assert.equal(result.precheck.citationCount, 2);
    assert.equal(result.boundary.humanPublicationPrecheckRecorded, true);
    assert.equal(result.boundary.finalAnswerPublished, false);
    assert.equal(result.boundary.studentVisible, false);
    assert.equal(result.boundary.mainDatabaseWriteStarted, false);
    assert.equal(result.boundary.requiresFutureDeliveryRuntime, true);
    assert.match(result.evidenceRefs.join("\n"), /evidence:publication-precheck-input-hash:sha256:/u);
    assert.match(formatDeepResearchPublicationPrecheck(result), /Student visible: false/u);
  });

  it("records revision-required prechecks without allowing delivery", () => {
    const input = baseInput();
    input.precheck = {
      ...input.precheck,
      decision: "REVISION_REQUIRED",
      comments: "Need stronger limitations before this preview can enter delivery review.",
    };

    const result = recordDeepResearchPublicationPrecheck(input, { commandLogPath: tempCommandLogPath() });

    assert.equal(result.status, "PUBLICATION_PRECHECK_REVISION_REQUIRED");
    assert.equal(result.precheck.approvedForFutureDelivery, false);
    assert.equal(result.boundary.revisionRequired, true);
    assert.equal(result.boundary.studentVisible, false);
  });

  it("uses idempotency for safe replay and rejects conflicting precheck inputs", () => {
    const commandLogPath = tempCommandLogPath();
    const first = recordDeepResearchPublicationPrecheck(baseInput(), { commandLogPath });
    const second = recordDeepResearchPublicationPrecheck(baseInput(), { commandLogPath });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fs.readFileSync(commandLogPath, "utf8").trim().split(/\r?\n/u).length, 1);
    assert.throws(
      () => recordDeepResearchPublicationPrecheck({
        ...baseInput(),
        precheckInvocationId: "different_publication_precheck_invocation",
      }, { commandLogPath }),
      /idempotency key already exists/u,
    );
  });

  it("rejects unsafe preview records, raw markup, students, and service principals", () => {
    assert.throws(
      () => recordDeepResearchPublicationPrecheck({
        ...baseInput(),
        renderPreviewRecord: {
          ...renderPreviewRecord(),
          boundary: { ...renderPreviewRecord().boundary, studentVisible: true },
        },
      }, { commandLogPath: tempCommandLogPath() }),
      /studentVisible must be false/u,
    );
    const unsafeText = baseInput();
    unsafeText.renderPreviewRecord.preview.claims[0].text = "<b>unsafe</b>";
    assert.throws(
      () => recordDeepResearchPublicationPrecheck(unsafeText, { commandLogPath: tempCommandLogPath() }),
      /must be encoded safe text/u,
    );
    assert.throws(
      () => recordDeepResearchPublicationPrecheck({
        ...baseInput(),
        principal: { ...principal(), role: "STUDENT", entryPoint: "STUDENT_APP" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research teacher or admin/u,
    );
    assert.throws(
      () => recordDeepResearchPublicationPrecheck({
        ...baseInput(),
        principal: { ...principal(), role: "SERVICE", subjectType: "SERVICE", entryPoint: "AGENT_INTERNAL" },
      }, { commandLogPath: tempCommandLogPath() }),
      /human research teacher or admin/u,
    );
  });

  it("rejects direct publication policy, student delivery, reviewer mismatch, and high-risk approval", () => {
    assert.throws(
      () => recordDeepResearchPublicationPrecheck({
        ...baseInput(),
        publicationPrecheckPolicy: { ...publicationPrecheckPolicy(), directPublicationAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /directPublicationAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchPublicationPrecheck({
        ...baseInput(),
        publicationPrecheckPolicy: { ...publicationPrecheckPolicy(), studentVisibleDeliveryAllowed: true },
      }, { commandLogPath: tempCommandLogPath() }),
      /studentVisibleDeliveryAllowed must be false/u,
    );
    assert.throws(
      () => recordDeepResearchPublicationPrecheck({
        ...baseInput(),
        precheck: { ...precheck(), reviewerPrincipalId: "different_reviewer" },
      }, { commandLogPath: tempCommandLogPath() }),
      /reviewerPrincipalId must match/u,
    );
    assert.throws(
      () => recordDeepResearchPublicationPrecheck({
        ...baseInput(),
        precheck: { ...precheck(), risk: { ...precheck().risk, publicationRisk: "HIGH" } },
      }, { commandLogPath: tempCommandLogPath() }),
      /HIGH risk/u,
    );
  });
});

function tempCommandLogPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-publication-precheck-")), "precheck.jsonl");
}

function baseInput() {
  return {
    schemaVersion: "2026-06-05.research.deep-research-publication-precheck.v1",
    precheckInvocationId: "deep_research_publication_precheck_inv_001",
    principal: principal(),
    renderPreviewRecord: renderPreviewRecord(),
    publicationPrecheckPolicy: publicationPrecheckPolicy(),
    precheck: precheck(),
    evidenceRefs: ["evidence:render-preview:job-001", "evidence:publication-precheck:desktop-research"],
    idempotencyKey: "deep-research-publication-precheck:job-001",
  };
}

function principal() {
  return {
    principalId: "teacher_research_reviewer_001",
    role: "TEACHER",
    subjectType: "USER",
    entryPoint: "DESKTOP_RESEARCH",
    scopes: ["RESEARCH_READ", "RESEARCH_WRITE", "KNOWLEDGE_PRIVATE_READ"],
    sessionId: "research_publication_precheck_session_001",
  };
}

function publicationPrecheckPolicy() {
  return {
    renderPreviewRequired: true,
    humanPublicationReviewRequired: true,
    evidenceIntegrityRequired: true,
    safetyReviewRequired: true,
    studentVisibilityReviewRequired: true,
    deliveryRuntimeRequired: true,
    directPublicationAllowed: false,
    studentVisibleDeliveryAllowed: false,
    directDatabaseAccessAllowed: false,
    mainDatabaseWriteAllowed: false,
    studentArchiveWriteAllowed: false,
    externalModelCallAllowed: false,
    remoteDeviceControlAllowed: false,
    localToolMutationAllowed: false,
    swarmAllowed: false,
  };
}

function precheck() {
  return {
    precheckId: "deep_research_publication_precheck_001",
    reviewerPrincipalId: "teacher_research_reviewer_001",
    decision: "APPROVED_FOR_DELIVERY_RUNTIME",
    reviewedAt: "2026-06-05T00:00:00.000Z",
    evidenceIntegrityReviewed: true,
    safetyReviewed: true,
    studentVisibilityReviewed: true,
    limitationsReviewed: true,
    risk: {
      hallucinationRisk: "LOW",
      privateKnowledgeRisk: "MEDIUM",
      studentDataRisk: "LOW",
      publicationRisk: "LOW",
    },
    comments: "Preview is safe to enter a future delivery runtime, but is not delivered by this precheck.",
  };
}

function renderPreviewRecord() {
  return JSON.parse(fs.readFileSync("contracts/agent/deep-research-render-preview.output.example.json", "utf8"));
}
