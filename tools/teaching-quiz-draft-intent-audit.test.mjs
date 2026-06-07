import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditTeachingQuizDraftIntent,
  formatTeachingQuizDraftIntentAudit,
} from "./teaching-quiz-draft-intent-audit.mjs";

describe("Teaching quiz draft intent runtime audit", () => {
  it("passes when the runtime is wired as review-only command intent", () => {
    const report = auditTeachingQuizDraftIntent(currentInputs(), {
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "TEACHING_QUIZ_DRAFT_INTENT_RUNTIME");
    assert.equal(report.boundary.executionCandidateAllowed, false);
    assert.equal(report.boundary.finalQuizWriteAllowed, false);
    assert.match(formatTeachingQuizDraftIntentAudit(report), /Teaching quiz draft intent runtime: READY/u);
  });

  it("fails when the OpenAPI contract claims a final create response", () => {
    const inputs = currentInputs();
    inputs.openapi = inputs.openapi.replace("'202':", "'201':");

    const report = auditTeachingQuizDraftIntent(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "openapi.review_only_accepted").passed, false);
  });

  it("fails when commandlog projects the draft intent into business tables", () => {
    const inputs = currentInputs();
    inputs.commandlog += "\nrepository.projectionQueue <- request\nrepository.archiveProjection.Create(ctx, item)\n";

    const report = auditTeachingQuizDraftIntent(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "commandlog.append_only_no_projection").passed, false);
  });

  it("fails when runtime is not wired in main", () => {
    const inputs = currentInputs();
    inputs.main = inputs.main.replace("NewSubmitTeachingQuizDraftIntent", "missing");

    const report = auditTeachingQuizDraftIntent(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "main.runtime_wired").passed, false);
  });
});

function currentInputs() {
  return {
    gateway: JSON.stringify({
      acceptedIntents: [
        {
          intentId: "draft_teaching_quiz",
          commandPort: {
            portName: "TeachingDraftCommandPort",
            operation: "submitQuizDraftIntent",
          },
          approvalRequired: true,
          executionCandidateAllowed: false,
          directDatabaseWriteAllowed: false,
        },
      ],
    }),
    openapi: [
      "operationId: submitTeachingQuizDraftIntent",
      "'202':",
      "const: REVIEW_REQUIRED",
      "const: AGENT_WRITE_INTENT_REVIEW_REQUIRED",
    ].join("\n"),
    domain: [
      "AuthorizeSubmitTeachingQuizDraftIntent",
      "ScopeTeachingWrite",
      "ScopeAgentCommandSubmit",
      "RequiresHarnessApproval",
      "SharedContextRef",
      "GuardrailResultRef",
      "RouteDecisionRef",
      "ApprovalArtifactRef",
      "RollbackPlanRef",
      "AuditTraceRef",
      "IdempotencyKey",
      "TeachingQuizDraftIntentReviewRequired",
    ].join("\n"),
    usecase: [
      "type TeachingDraftCommandPort interface",
      "SubmitQuizDraftIntent(ctx context.Context, intent domain.TeachingQuizDraftIntent)",
      "NewSubmitTeachingQuizDraftIntent",
      "domain.AuthorizeSubmitTeachingQuizDraftIntent",
    ].join("\n"),
    commandlog: [
      "submit_teaching_quiz_draft_intent",
      "QuizDraftIntent",
      "acceptCommandIntent",
      "appendCommandIntent",
      "NewIntentRepository",
    ].join("\n"),
    http: [
      "http.StatusAccepted",
      "review-only-command-intent",
      "SubmitTeachingQuizDraftIntentInput",
    ].join("\n"),
    routes: "/v1/teaching/quiz-draft-intents",
    main: [
      "NewSubmitTeachingQuizDraftIntent",
      "TeachingQuizDraftIntentIDGenerator",
      "TeachingDraftCommandPort",
      "teachingIntentCommandPortFromConfig",
    ].join("\n"),
    verifyStructure: [
      "teaching-archive.quiz-draft-intents.path.yaml",
      "teaching_quiz_draft_intent.go",
      "submit_teaching_quiz_draft_intent.go",
      "server_quiz_draft_intent.go",
      "SubmitTeachingQuizDraftIntent",
    ].join("\n"),
  };
}
