import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditDeepResearchRenderPreview,
  formatDeepResearchRenderPreviewAudit,
} from "./research-deep-research-render-preview-audit.mjs";

describe("Research deep_research render preview audit", () => {
  it("passes when render preview consumes finalization and remains unpublished", () => {
    const report = auditDeepResearchRenderPreview(currentInputs(), {
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW");
    assert.equal(report.runtime.runtimeId, "research_deep_research_render_preview_runtime");
    assert.equal(report.runtime.commandPort, "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview");
    assert.equal(report.runtimeSlo.totalErrors, 0);
    assert.equal(report.runtimeSlo.p99Ms <= 300, true);
    assert.equal(report.runtimeProbes.renderPreview.result.status, "RENDER_PREVIEW_READY_NOT_PUBLISHED");
    assert.equal(report.runtimeProbes.renderPreview.result.boundary.studentVisible, false);
    assert.match(formatDeepResearchRenderPreviewAudit(report), /Research deep_research render preview: READY/u);
  });

  it("fails when runtime claims publication, student visibility, writes, model access, or unsafe rendering", () => {
    const inputs = currentInputs();
    inputs.runtime = `${inputs.runtime}\npublicationAllowed: true\nstudentVisible: true\ninnerHTML\n`;

    const report = auditDeepResearchRenderPreview(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "runtime.finalization_synthesis_and_safety_boundaries").passed, false);
  });

  it("caps the probe p99 at the async render preview boundary budget", () => {
    const report = auditDeepResearchRenderPreview(currentInputs(), {
      probeP99Ms: 350,
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.runtimeSlo.p99Ms, 300);
  });

  it("fails when quality, structure, root workflow, or board hooks omit the render preview slice", () => {
    const inputs = currentInputs();
    inputs.packageJson = JSON.stringify({ scripts: {} });
    inputs.rootWorkflowCoverage = inputs.rootWorkflowCoverage
      .replaceAll("researchDeepResearchRenderPreview", "researchDeepResearchFuturePublication")
      .replace("research-deep-research-render-preview.current.json", "research-deep-research-future-publication.current.json")
      .replace("research_deep_research_render_preview_runtime", "research_deep_research_future_publication_runtime");
    inputs.verifyStructure = inputs.verifyStructure.replaceAll("research-deep-research-render-preview", "research-deep-research-future-publication");
    inputs.architectureBoard = "ResearchAgent.deep_research finalization runtime 8.8/10";

    const report = auditDeepResearchRenderPreview(inputs);

    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_tracks_runtime").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_workflow.requires_render_preview_report").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "structure_tracks_runtime_files").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "architecture_board.reflects_render_preview_progress").passed, false);
  });
});

function currentInputs() {
  return {
    inputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-render-preview.v1" },
        reasoningSynthesisRecord: { properties: { runtimeId: { const: "research_deep_research_reasoning_synthesis_runtime" } } },
        finalizationRecord: { properties: { runtimeId: { const: "research_deep_research_finalization_runtime" } } },
        renderPolicy: { properties: { publicationAllowed: { const: false }, studentVisibleAllowed: { const: false } } },
      },
    }),
    outputSchema: JSON.stringify({
      properties: {
        schemaVersion: { const: "2026-06-05.research.deep-research-render-preview-recorded.v1" },
        runtimeId: { const: "research_deep_research_render_preview_runtime" },
        commandPort: { const: "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview" },
      },
    }),
    inputExample: JSON.stringify({
      finalizationRecord: { status: "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED" },
      renderPolicy: { publicationAllowed: false },
    }),
    outputExample: JSON.stringify({
      status: "RENDER_PREVIEW_READY_NOT_PUBLISHED",
      boundary: { renderPreviewRecorded: true, studentVisible: false },
    }),
    runtime: [
      'export const RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_RUNTIME_ID = "research_deep_research_render_preview_runtime";',
      'export const RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW_COMMAND_PORT = "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview";',
      "RESEARCH_DEEP_RESEARCH_RENDER_PREVIEW",
      "recordDeepResearchRenderPreview",
      "RENDER_PREVIEW_READY_NOT_PUBLISHED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "input.reasoningSynthesisRecord.runtimeId",
      "research_deep_research_reasoning_synthesis_runtime",
      "input.finalizationRecord.runtimeId",
      "research_deep_research_finalization_runtime",
      "FINAL_ANSWER_FINALIZED_NOT_PUBLISHED",
      "assertRecordsMatch",
      "escapePreviewText",
      "citationIntegrityPreserved: true",
      "sourceHashIntegrityPreserved: true",
      "unsafeTextEncoded: true",
      "studentVisible: false",
      "requiresFuturePublicationReview: true",
    ].join("\n"),
    runtimeTest: [
      "records a teacher-only preview from finalized and synthesized records",
      "encodes unsafe text and preserves citations, source hashes, limitations, and review refs",
      "uses idempotency for safe replay and rejects conflicting preview inputs",
      "rejects mismatched records, unsafe finalization boundaries, students, and service principals",
      "rejects publication, student visibility, unsafe render policy, and invalid evidence",
    ].join("\n"),
    packageJson: JSON.stringify({
      scripts: {
        "audit:research-deep-research-render-preview": "node tools/research-deep-research-render-preview-audit.mjs --out reports/research-deep-research-render-preview.current.json",
      },
    }),
    qualityGate: "Research deep_research render preview audit",
    rootWorkflowCoverage: [
      "researchDeepResearchRenderPreview",
      "research-deep-research-render-preview.current.json",
      "research_deep_research_render_preview_runtime",
    ].join("\n"),
    verifyStructure: [
      "0249-research-deep-research-render-preview-runtime.md",
      "deep-research-render-preview.input.schema.json",
      "deep-research-render-preview.output.schema.json",
      "research-deep-research-render-preview-runtime.mjs",
      "research-deep-research-render-preview-runtime.test.mjs",
      "research-deep-research-render-preview-audit.mjs",
      "research-deep-research-render-preview-audit.test.mjs",
    ].join("\n"),
    architectureBoard: "ResearchAgent.deep_research render preview runtime 8.9/10; previous 8.8/10 finalization milestone",
    sdd: [
      "render preview runtime",
      "DeepResearchRenderPreviewPort.recordDeepResearchRenderPreview",
      "This is not final-answer publication",
      "requiresFuturePublicationReview",
    ].join("\n"),
  };
}
