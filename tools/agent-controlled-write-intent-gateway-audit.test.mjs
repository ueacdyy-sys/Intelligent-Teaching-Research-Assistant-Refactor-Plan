import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditAgentControlledWriteIntentGateway,
  formatAgentControlledWriteIntentGatewayAudit,
} from "./agent-controlled-write-intent-gateway-audit.mjs";

describe("Agent controlled write intent gateway audit", () => {
  it("passes when write intents are review-only, approval-gated, and rollback-evidenced", () => {
    const report = auditAgentControlledWriteIntentGateway(currentInputs(), {
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    assert.equal(report.readiness, "READY");
    assert.equal(report.workloadType, "AGENT_CONTROLLED_WRITE_INTENT_GATEWAY");
    assert.equal(report.gateway.acceptedIntentCount, 3);
    assert.equal(report.controlledWriteBoundary.commandIntentRecordingAllowed, true);
    assert.equal(report.controlledWriteBoundary.executionCandidateAllowed, false);
    assert.equal(report.acceptedIntents[0].intentId, "draft_teaching_quiz");
    assert.match(formatAgentControlledWriteIntentGatewayAudit(report), /Agent controlled write intent gateway: READY/u);
  });

  it("fails when an immediate business write is enabled", () => {
    const inputs = currentInputs();
    inputs.gatewayExample.writeBoundary.immediateBusinessWriteAllowed = true;

    const report = auditAgentControlledWriteIntentGateway(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "boundary.no_immediate_business_writes").passed, false);
  });

  it("fails when an intent can bypass approval or expose execution candidates", () => {
    const inputs = currentInputs();
    inputs.gatewayExample.acceptedIntents[0].approvalRequired = false;
    inputs.gatewayExample.acceptedIntents[0].executionCandidateAllowed = true;

    const report = auditAgentControlledWriteIntentGateway(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "gateway.intent_allowlist").passed, false);
  });

  it("fails when Harness execution candidates are enabled", () => {
    const inputs = currentInputs();
    inputs.gatewayExample.harnessBoundary.executionCandidateAllowed = true;
    inputs.executionCandidateViewSchema.properties.candidateCount.const = 1;

    const report = auditAgentControlledWriteIntentGateway(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "harness.review_only_boundary").passed, false);
  });

  it("fails when rollback evidence is not required", () => {
    const inputs = currentInputs();
    inputs.gatewayExample.rollback.rollbackPlanRequired = false;
    inputs.gatewayExample.evidence.rollbackPlanRequired = false;

    const report = auditAgentControlledWriteIntentGateway(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "rollback.preconditions_required").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "evidence.full_trace_required").passed, false);
  });

  it("fails when write-intent Agent tasks skip human approval", () => {
    const inputs = currentInputs();
    inputs.agentTaskExample.tasks = inputs.agentTaskExample.tasks.map((task) =>
      task.writeIntent ? { ...task, requiresHumanApproval: false } : task
    );

    const report = auditAgentControlledWriteIntentGateway(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "agent_tasks.write_intent_requires_approval").passed, false);
  });

  it("fails when dangerous skills skip Harness or rollback evidence", () => {
    const inputs = currentInputs();
    const skill = inputs.skillExamples.skills.find((candidate) => candidate.skillId === "draft_workflow");
    skill.harnessRequired = false;
    skill.evidencePolicy.requiredEvidenceRefs = skill.evidencePolicy.requiredEvidenceRefs.filter((ref) => ref !== "ROLLBACK");

    const report = auditAgentControlledWriteIntentGateway(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "skill_manifest.dangerous_skills_harnessed").passed, false);
  });

  it("fails when promotion claims real write execution", () => {
    const inputs = currentInputs();
    inputs.gatewayExample.promotion.businessWriteExecutionClaimAllowed = true;

    const report = auditAgentControlledWriteIntentGateway(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "promotion.no_execution_claims").passed, false);
  });
});

function currentInputs() {
  return {
    gatewaySchema: {
      properties: {
        schemaVersion: { const: "2026-06-04.agent.controlled-write-intent-gateway.v1" },
        gatewayId: { const: "agent_controlled_write_intent_gateway" },
        gatewayMode: { const: "REVIEW_ONLY_COMMAND_INTENT" },
      },
    },
    gatewayExample: gatewayExample(),
    agentTaskExample: agentTaskExample(),
    skillExamples: skillExamples(),
    executionCandidateViewSchema: executionCandidateViewSchema(),
  };
}

function gatewayExample() {
  return {
    schemaVersion: "2026-06-04.agent.controlled-write-intent-gateway.v1",
    gatewayId: "agent_controlled_write_intent_gateway",
    gatewayMode: "REVIEW_ONLY_COMMAND_INTENT",
    acceptedIntents: [
      writeIntent("draft_teaching_quiz", "TeachingAgent", "TEACHING", "QUIZ_DRAFT", "TeachingDraftCommandPort", "submitQuizDraftIntent"),
      writeIntent("draft_archive_material", "TeachingAgent", "TEACHING", "ARCHIVE_MATERIAL_DRAFT", "TeachingDraftCommandPort", "submitArchiveMaterialDraftIntent"),
      writeIntent("draft_workflow_plugin", "WorkflowAgent", "WORKFLOW", "WORKFLOW_PLUGIN_DRAFT", "WorkflowDraftCommandPort", "submitWorkflowPluginDraftIntent"),
    ],
    writeBoundary: {
      commandIntentRecordingAllowed: true,
      immediateBusinessWriteAllowed: false,
      directDatabaseWriteAllowed: false,
      localToolMutationAllowed: false,
      finalAiGradingWriteAllowed: false,
      workflowPublishAllowed: false,
      modelTrainingWriteAllowed: false,
      rejectionMode: "DENY_OR_REVIEW_WITH_EVIDENCE",
    },
    admissionGuards: {
      principalContextRequired: true,
      sharedContextRequired: true,
      guardrailResultRequired: true,
      routeDecisionRequired: true,
      humanApprovalRequiredForEveryIntent: true,
      denyUnknownIntent: true,
      denyOnMissingRollbackPlan: true,
      denyOnCrossScopeData: true,
      denyOnDirectDatabaseRequest: true,
      denyOnFinalEvaluationWrite: true,
      denyOnWorkflowPublish: true,
      denyOnLocalToolMutation: true,
    },
    harnessBoundary: {
      harnessApprovalRequired: true,
      approvalArtifactRequired: true,
      approvalDecisionRequiredBeforeExecution: true,
      executionCandidateAllowed: false,
      executionCandidateViewRef: "contracts/harness/execution-candidate-view.schema.json",
      executionDisabledReason: "real local execution is disabled by current SDD",
    },
    evidence: {
      permissionTraceRequired: true,
      guardrailTraceRequired: true,
      routeDecisionRequired: true,
      inputHashRequired: true,
      outputSummaryRequired: true,
      commandIntentRecordRequired: true,
      approvalArtifactRefRequired: true,
      eventEnvelopeRequired: true,
      rollbackPlanRequired: true,
      idempotencyKeyRequired: true,
      auditTraceRequired: true,
    },
    eventing: {
      appendOnlyEventRequired: true,
      outboxRequired: true,
      eventBeforeExecutionRequired: true,
      requiredEventTypes: [
        "AGENT_WRITE_INTENT_SUBMITTED",
        "AGENT_WRITE_INTENT_REVIEW_REQUIRED",
        "AGENT_WRITE_INTENT_REJECTED",
      ],
    },
    rollback: {
      rollbackPlanRequired: true,
      dryRunDiffRequired: true,
      compensatingActionRequiredBeforeExecution: true,
      humanRollbackReviewRequired: true,
    },
    promotion: {
      currentEvidenceClass: "CONTRACT_REVIEW_ONLY_NO_EXECUTION",
      rootWorkflowRequired: true,
      businessWriteExecutionClaimAllowed: false,
      finalAiGradingClaimAllowed: false,
      workflowPublishClaimAllowed: false,
      localToolMutationClaimAllowed: false,
    },
  };
}

function writeIntent(intentId, workerAgent, taskKind, targetCapability, portName, operation) {
  return {
    intentId,
    workerAgent,
    taskKind,
    targetCapability,
    rootRequirementAnchors: ["教学模式"],
    commandPort: {
      portName,
      operation,
      idempotencyKeyRequired: true,
      outboxEventRequired: true,
    },
    approvalRequired: true,
    directDatabaseWriteAllowed: false,
    executionCandidateAllowed: false,
    finalEvaluationWriteAllowed: false,
  };
}

function agentTaskExample() {
  return {
    tasks: [
      {
        taskId: "agent_task_lesson_quiz_001",
        taskKind: "TEACHING",
        writeIntent: true,
        requiresHumanApproval: true,
        rootRequirementAnchors: ["教学模式", "随堂测验", "统筹智能体"],
      },
    ],
  };
}

function skillExamples() {
  return {
    skills: [
      {
        skillId: "draft_workflow",
        requiredPermissions: ["WORKFLOW_DRAFT", "FILE_WRITE"],
        harnessRequired: true,
        directDatabaseWriteAllowed: false,
        evidencePolicy: { requiredEvidenceRefs: ["PERMISSION", "ROLLBACK"] },
      },
    ],
  };
}

function executionCandidateViewSchema() {
  return {
    properties: {
      candidateCount: { const: 0 },
      candidates: { maxItems: 0 },
    },
  };
}
