import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchPublicationPrecheck,
  formatDeepResearchPublicationPrecheckAudit,
} from "./research-deep-research-publication-precheck-audit.mjs";

describe("Research deep_research publication precheck audit", () => {
  it("passes when publication precheck consumes render preview and remains undelivered", () => {
    const report = auditDeepResearchPublicationPrecheck(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK");
    assert.equal(report.runtime.runtimeId, "research_deep_research_publication_precheck_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.publicationPrecheck.result.status, "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED");
    assert.equal(report.runtimeProbes.publicationPrecheck.result.boundary.studentVisible, false);
    assert.equal(report.runtimeProbes.publicationPrecheck.result.boundary.requiresFutureDeliveryRuntime, true);
    assert.match(formatDeepResearchPublicationPrecheckAudit(report), /Research deep_research publication precheck: READY/u);
  });

  it("fails when runtime claims direct publication, student delivery, writes, model access, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\ndirectPublicationAllowed: true\nstudentVisible: true\ninnerHTML\n`;

    const report = auditDeepResearchPublicationPrecheck(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.render_preview_review_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async publication precheck boundary budget", () => {
    const report = auditDeepResearchPublicationPrecheck(currentInputs(), {
      probeP99Ms: 350,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, or board hooks omit the precheck slice", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchPublicationPrecheck", "researchDeepResearchFutureDelivery")
      .replace("research-deep-research-publication-precheck.current.json", "research-deep-research-future-delivery.current.json")
      .replace("research_deep_research_publication_precheck_runtime", "research_deep_research_future_delivery_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-publication-precheck", "research-deep-research-future-delivery");
    inputs.architectureBoard = "ResearchAgent.deep_research render preview runtime 8.9/10";

    const report = auditDeepResearchPublicationPrecheck(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_publication_precheck_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_publication_precheck_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-publication-precheck.v1" },
        renderPreviewRecord: {
          properties: {
            runtimeId: { const: "research_deep_research_render_preview_runtime" },
            status: { const: "RENDER_PREVIEW_READY_NOT_PUBLISHED" },
          },
        },
        publicationPrecheckPolicy: {
          properties: {
            directPublicationAllowed: { const: false },
            studentVisibleDeliveryAllowed: { const: false },
          },
        },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-publication-precheck-recorded.v1" },
        runtimeId: { const: "research_deep_research_publication_precheck_runtime" },
        commandPort: { const: "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck" },
        boundary: { properties: { requiresFutureDeliveryRuntime: { const: true } } },
      },
    }),
    inputExample: JSON.stringify({
      renderPreviewRecord: { status: "RENDER_PREVIEW_READY_NOT_PUBLISHED" },
      publicationPrecheckPolicy: { directPublicationAllowed: false, studentVisibleDeliveryAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED",
      boundary: { humanPublicationPrecheckRecorded: true, studentVisible: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_RUNTIME_ID = "research_deep_research_publication_precheck_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_COMMAND_PORT = "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck";',
      "RESEARCH_DEEP_RESEARCH_PUBLICATION_PRECHECK_READY",
      "recordDeepResearchPublicationPrecheck",
      "PUBLICATION_PRECHECK_APPROVED_NOT_DELIVERED",
      "PUBLICATION_PRECHECK_REVISION_REQUIRED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.renderPreviewRecord.runtimeId",
      "research_deep_research_render_preview_runtime",
      "RENDER_PREVIEW_READY_NOT_PUBLISHED",
      "publication precheck requires a human research teacher or admin",
      "RESEARCH_READ",
      "RESEARCH_WRITE",
      "requireSafeText",
      "HIGH risk",
      "renderPreviewVerified: true",
      "humanPublicationPrecheckRecorded: true",
      "approvedForFutureDelivery",
      "studentVisible: false",
      "requiresFutureDeliveryRuntime: true",
    ].join("\n"),
    runtimeTest: [
      "records an approved publication precheck without delivering to students",
      "records revision-required prechecks without allowing delivery",
      "uses idempotency for safe replay and rejects conflicting precheck inputs",
      "rejects unsafe preview records, raw markup, students, and service principals",
      "rejects direct publication policy, student delivery, reviewer mismatch, and high-risk approval",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-publication-precheck": "node tools/research-deep-research-publication-precheck-audit.mjs --out reports/research-deep-research-publication-precheck.current.json",
      },
    }),
    qualityGate: "Research deep_research publication precheck audit",
    rootWorkflowCoverage: [
      "researchDeepResearchPublicationPrecheck",
      "research-deep-research-publication-precheck.current.json",
      "research_deep_research_publication_precheck_runtime",
    ].join("\n"),
    verifyStructure: [
      "0250-research-deep-research-publication-precheck-runtime.md",
      "deep-research-publication-precheck.input.schema.json",
      "deep-research-publication-precheck.output.schema.json",
      "deep-research-publication-precheck.input.example.json",
      "deep-research-publication-precheck.output.example.json",
      "research-deep-research-publication-precheck-runtime.mjs",
      "research-deep-research-publication-precheck-runtime.test.mjs",
      "research-deep-research-publication-precheck-audit.mjs",
      "research-deep-research-publication-precheck-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research publication precheck runtime 9.0/10; previous 8.9/10 render preview milestone",
    sdd: [
      "publication precheck runtime",
      "DeepResearchPublicationPrecheckPort.recordDeepResearchPublicationPrecheck",
      "This is not publication",
      "requiresFutureDeliveryRuntime=true",
    ].join("\n"),
  };
}
