import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingArchiveMaterialDraftIntent,
  formatTeachingArchiveMaterialDraftIntentAudit,
} from "./teaching-archive-material-draft-intent-audit.mjs";

describe("Teaching archive material draft intent runtime audit", () => {
  it("passes when the runtime is wired as review-only command intent", () => {
    const report = auditTeachingArchiveMaterialDraftIntent(currentInputs(), {
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_ARCHIVE_MATERIAL_DRAFT_INTENT_RUNTIME");
    assert.equal(report.boundary.executionCandidateAllowed, false);
    assert.equal(report.boundary.finalArchiveItemWriteAllowed, false);
    assert.match(formatTeachingArchiveMaterialDraftIntentAudit(report), /Teaching archive material draft intent runtime: READY/u);
  });

  it("fails when the OpenAPI contract claims a final create response", () => {
    const inputs = currentInputs();
    inputs.openapi = inputs.openapi.replace("'202':", "'201':");

    const report = auditTeachingArchiveMaterialDraftIntent(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "openapi.review_only_accepted").passed, false);
  });

  it("fails when commandlog projects the draft intent into business tables", () => {
    const inputs = currentInputs();
    inputs.commandlog += "\nrepository.projectionQueue <- request\nrepository.archiveProjection.Create(ctx, item)\n";

    const report = auditTeachingArchiveMaterialDraftIntent(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "commandlog.append_only_no_projection").passed, false);
  });

  it("fails when runtime is not wired in main", () => {
    const inputs = currentInputs();
    inputs.main = inputs.main.replace("NewSubmitTeachingArchiveMaterialDraftIntent", "missing");

    const report = auditTeachingArchiveMaterialDraftIntent(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "main.runtime_wired").passed, false);
  });
});

function currentInputs() {
  return {
    gateway: JSON.stringify({
      acceptedIntents: [
        {
          intentId: "draft_archive_material",
          commandPort: {
            portName: "TeachingDraftCommandPort",
            operation: "submitArchiveMaterialDraftIntent",
          },
          approvalRequired: true,
          executionCandidateAllowed: false,
          directDatabaseWriteAllowed: false,
        },
      ],
    }),
    openapi: [
      "operationId: submitTeachingArchiveMaterialDraftIntent",
      "'202':",
      "const: REVIEW_REQUIRED",
      "const: AGENT_WRITE_INTENT_REVIEW_REQUIRED",
    ].join("\n"),
    domain: [
      "AuthorizeSubmitTeachingArchiveMaterialDraftIntent",
      "ScopeTeachingWrite",
      "ScopeAgentCommandSubmit",
      "RequiresHarnessApproval",
      "SharedContextRef",
      "GuardrailResultRef",
      "RouteDecisionRef",
      "DraftArtifactRef",
      "ApprovalArtifactRef",
      "RollbackPlanRef",
      "AuditTraceRef",
      "IdempotencyKey",
      "TeachingArchiveMaterialDraftIntentReviewRequired",
    ].join("\n"),
    usecase: [
      "NewSubmitTeachingArchiveMaterialDraftIntent",
      "SubmitArchiveMaterialDraftIntent(ctx, intent)",
      "domain.AuthorizeSubmitTeachingArchiveMaterialDraftIntent",
    ].join("\n"),
    commandlog: [
      "submit_teaching_archive_material_draft_intent",
      "ArchiveMaterialDraftIntent",
      "archiveMaterialDraftIntentToPayload",
      "appendCommandIntent",
    ].join("\n"),
    http: [
      "http.StatusAccepted",
      "review-only-command-intent",
      "SubmitTeachingArchiveMaterialDraftIntentInput",
    ].join("\n"),
    routes: "/v1/teaching/archive-material-draft-intents",
    main: [
      "NewSubmitTeachingArchiveMaterialDraftIntent",
      "TeachingArchiveMaterialDraftIntentIDGenerator",
      "TeachingDraftCommandPort",
      "SubmitArchiveMaterialDraftIntent",
    ].join("\n"),
    verifyStructure: [
      "teaching-archive.archive-material-draft-intents.path.yaml",
      "teaching_archive_material_draft_intent.go",
      "submit_teaching_archive_material_draft_intent.go",
      "server_archive_material_draft_intent.go",
      "SubmitArchiveMaterialDraftIntent",
    ].join("\n"),
  };
}
