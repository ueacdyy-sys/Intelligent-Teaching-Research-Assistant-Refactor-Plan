import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/agent-controlled-write-intent-gateway.current.json";
const contractFiles = {
  gatewaySchema: "contracts/agent/controlled-write-intent-gateway.schema.json",
  gatewayExample: "contracts/agent/controlled-write-intent-gateway.example.json",
  agentTaskExample: "contracts/agent/agent-task.example.json",
  skillExamples: "contracts/agent/skill-manifest.examples.json",
  executionCandidateViewSchema: "contracts/harness/execution-candidate-view.schema.json",
};

const requiredIntentIds = [
  "draft_teaching_quiz",
  "draft_archive_material",
  "draft_workflow_plugin",
];

const requiredEventTypes = [
  "AGENT_WRITE_INTENT_SUBMITTED",
  "AGENT_WRITE_INTENT_REVIEW_REQUIRED",
  "AGENT_WRITE_INTENT_REJECTED",
];

export function auditAgentControlledWriteIntentGateway(inputs, options = {}) {
  const findings = [];
  const schema = inputs.gatewaySchema ?? {};
  const gateway = inputs.gatewayExample ?? {};
  const tasks = Array.isArray(inputs.agentTaskExample?.tasks) ? inputs.agentTaskExample.tasks : [];
  const skills = Array.isArray(inputs.skillExamples?.skills) ? inputs.skillExamples.skills : [];
  const executionCandidateViewSchema = inputs.executionCandidateViewSchema ?? {};

  addFinding(findings, {
    id: "gateway.schema_identity",
    passed: schema.properties?.schemaVersion?.const === "2026-06-04.agent.controlled-write-intent-gateway.v1" &&
      schema.properties?.gatewayId?.const === "agent_controlled_write_intent_gateway" &&
      schema.properties?.gatewayMode?.const === "REVIEW_ONLY_COMMAND_INTENT" &&
      gateway.schemaVersion === "2026-06-04.agent.controlled-write-intent-gateway.v1" &&
      gateway.gatewayId === "agent_controlled_write_intent_gateway" &&
      gateway.gatewayMode === "REVIEW_ONLY_COMMAND_INTENT",
    actual: `schema=${schema.properties?.schemaVersion?.const};gateway=${gateway.gatewayId};mode=${gateway.gatewayMode}`,
    expected: "controlled write intent gateway v1, agent_controlled_write_intent_gateway, REVIEW_ONLY_COMMAND_INTENT",
    remediation: "Keep this gateway as a review-only command intent boundary until a later SDD enables real execution.",
  });

  addFinding(findings, {
    id: "gateway.intent_allowlist",
    passed: intentsMatch(gateway.acceptedIntents),
    actual: summarizeIntents(gateway.acceptedIntents),
    expected: requiredIntentIds.join(","),
    remediation: "Only teaching quiz drafts, archive material drafts, and workflow/plugin drafts are accepted in this slice.",
  });

  addFinding(findings, {
    id: "boundary.no_immediate_business_writes",
    passed: gateway.writeBoundary?.commandIntentRecordingAllowed === true &&
      gateway.writeBoundary?.immediateBusinessWriteAllowed === false &&
      gateway.writeBoundary?.directDatabaseWriteAllowed === false &&
      gateway.writeBoundary?.localToolMutationAllowed === false &&
      gateway.writeBoundary?.finalAiGradingWriteAllowed === false &&
      gateway.writeBoundary?.workflowPublishAllowed === false &&
      gateway.writeBoundary?.modelTrainingWriteAllowed === false &&
      gateway.writeBoundary?.rejectionMode === "DENY_OR_REVIEW_WITH_EVIDENCE",
    actual: summarizeWriteBoundary(gateway.writeBoundary),
    expected: "record command intent only; no direct DB, business write, final grading, workflow publish, model training, or local mutation",
    remediation: "Agent write paths must create reviewable command intent evidence, not immediate business side effects.",
  });

  addFinding(findings, {
    id: "admission.guards_required",
    passed: allTrue(gateway.admissionGuards, [
      "principalContextRequired",
      "sharedContextRequired",
      "guardrailResultRequired",
      "routeDecisionRequired",
      "humanApprovalRequiredForEveryIntent",
      "denyUnknownIntent",
      "denyOnMissingRollbackPlan",
      "denyOnCrossScopeData",
      "denyOnDirectDatabaseRequest",
      "denyOnFinalEvaluationWrite",
      "denyOnWorkflowPublish",
      "denyOnLocalToolMutation",
    ]),
    actual: summarizeBooleanMap(gateway.admissionGuards),
    expected: "principal/shared/guardrail/route/human approval and denial guards all true",
    remediation: "Controlled writes need identity, context, guardrail, route, approval, scope, and rollback checks.",
  });

  addFinding(findings, {
    id: "harness.review_only_boundary",
    passed: gateway.harnessBoundary?.harnessApprovalRequired === true &&
      gateway.harnessBoundary?.approvalArtifactRequired === true &&
      gateway.harnessBoundary?.approvalDecisionRequiredBeforeExecution === true &&
      gateway.harnessBoundary?.executionCandidateAllowed === false &&
      gateway.harnessBoundary?.executionCandidateViewRef === "contracts/harness/execution-candidate-view.schema.json" &&
      gateway.harnessBoundary?.executionDisabledReason === "real local execution is disabled by current SDD" &&
      executionCandidateViewSchema.properties?.candidateCount?.const === 0 &&
      executionCandidateViewSchema.properties?.candidates?.maxItems === 0,
    actual: summarizeHarnessBoundary(gateway.harnessBoundary, executionCandidateViewSchema),
    expected: "approval artifacts required and execution candidates remain disabled",
    remediation: "This slice may submit approval artifacts but must not expose executable local or business-write candidates.",
  });

  addFinding(findings, {
    id: "evidence.full_trace_required",
    passed: allTrue(gateway.evidence, [
      "permissionTraceRequired",
      "guardrailTraceRequired",
      "routeDecisionRequired",
      "inputHashRequired",
      "outputSummaryRequired",
      "commandIntentRecordRequired",
      "approvalArtifactRefRequired",
      "eventEnvelopeRequired",
      "rollbackPlanRequired",
      "idempotencyKeyRequired",
      "auditTraceRequired",
    ]),
    actual: summarizeBooleanMap(gateway.evidence),
    expected: "permission, guardrail, route, input, output, command, approval, event, rollback, idempotency, and audit trace evidence",
    remediation: "Every Agent write intent must be explainable, deduplicated, reviewable, and reversible before execution can be considered.",
  });

  addFinding(findings, {
    id: "eventing.outbox_before_execution",
    passed: gateway.eventing?.appendOnlyEventRequired === true &&
      gateway.eventing?.outboxRequired === true &&
      gateway.eventing?.eventBeforeExecutionRequired === true &&
      hasAll(gateway.eventing?.requiredEventTypes ?? [], requiredEventTypes),
    actual: summarizeEventing(gateway.eventing),
    expected: requiredEventTypes.join(","),
    remediation: "Write intent must emit append-only outbox events before any future execution path.",
  });

  addFinding(findings, {
    id: "rollback.preconditions_required",
    passed: gateway.rollback?.rollbackPlanRequired === true &&
      gateway.rollback?.dryRunDiffRequired === true &&
      gateway.rollback?.compensatingActionRequiredBeforeExecution === true &&
      gateway.rollback?.humanRollbackReviewRequired === true,
    actual: summarizeBooleanMap(gateway.rollback),
    expected: "rollback plan, dry-run diff, compensating action, and human rollback review all required",
    remediation: "Do not promote write execution until every write intent has a rollback story humans can inspect.",
  });

  addFinding(findings, {
    id: "agent_tasks.write_intent_requires_approval",
    passed: tasks.some((task) =>
      task.writeIntent === true &&
      task.requiresHumanApproval === true &&
      task.taskKind === "TEACHING" &&
      Array.isArray(task.rootRequirementAnchors) &&
      task.rootRequirementAnchors.includes("随堂测验")
    ),
    actual: summarizeTaskApproval(tasks),
    expected: "a Teaching writeIntent task requires human approval and maps to root quiz anchors",
    remediation: "AgentTask examples must show that teaching write intents are approval-gated.",
  });

  addFinding(findings, {
    id: "skill_manifest.dangerous_skills_harnessed",
    passed: skills.length > 0 && skills
      .filter((skill) => hasWriteOrMutationPermission(skill))
      .every((skill) =>
        skill.harnessRequired === true &&
        skill.directDatabaseWriteAllowed === false &&
        Array.isArray(skill.evidencePolicy?.requiredEvidenceRefs) &&
        skill.evidencePolicy.requiredEvidenceRefs.includes("ROLLBACK")
      ),
    actual: summarizeDangerousSkills(skills),
    expected: "dangerous/write-capable skills require Harness, deny direct DB writes, and include ROLLBACK evidence",
    remediation: "Skills that can write, publish, launch processes, or mutate local tools must remain Harness-gated and rollback-evidenced.",
  });

  addFinding(findings, {
    id: "promotion.no_execution_claims",
    passed: gateway.promotion?.currentEvidenceClass === "CONTRACT_REVIEW_ONLY_NO_EXECUTION" &&
      gateway.promotion?.rootWorkflowRequired === true &&
      gateway.promotion?.businessWriteExecutionClaimAllowed === false &&
      gateway.promotion?.finalAiGradingClaimAllowed === false &&
      gateway.promotion?.workflowPublishClaimAllowed === false &&
      gateway.promotion?.localToolMutationClaimAllowed === false,
    actual: summarizePromotion(gateway.promotion),
    expected: "contract review-only evidence; no business write, final grading, workflow publish, or local mutation claims",
    remediation: "Keep this report honest: it is a controlled write-intent contract, not working write execution.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "AGENT_CONTROLLED_WRITE_INTENT_GATEWAY",
    gateway: {
      gatewayId: gateway.gatewayId ?? null,
      gatewayMode: gateway.gatewayMode ?? null,
      acceptedIntentCount: Array.isArray(gateway.acceptedIntents) ? gateway.acceptedIntents.length : 0,
      evidenceClass: gateway.promotion?.currentEvidenceClass ?? null,
    },
    controlledWriteBoundary: {
      commandIntentRecordingAllowed: gateway.writeBoundary?.commandIntentRecordingAllowed === true,
      immediateBusinessWriteAllowed: Boolean(gateway.writeBoundary?.immediateBusinessWriteAllowed),
      directDatabaseWriteAllowed: Boolean(gateway.writeBoundary?.directDatabaseWriteAllowed),
      finalAiGradingWriteAllowed: Boolean(gateway.writeBoundary?.finalAiGradingWriteAllowed),
      workflowPublishAllowed: Boolean(gateway.writeBoundary?.workflowPublishAllowed),
      localToolMutationAllowed: Boolean(gateway.writeBoundary?.localToolMutationAllowed),
      executionCandidateAllowed: Boolean(gateway.harnessBoundary?.executionCandidateAllowed),
    },
    acceptedIntents: summarizeIntentReports(gateway.acceptedIntents),
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the shared Agent write-intent safety contract; next implementation slice can wire one Teaching draft command port without enabling real execution candidates."
      : "Fix controlled write-intent contracts before adding any Agent write execution or AI grading write path.",
  };
}

export function formatAgentControlledWriteIntentGatewayAudit(report) {
  const lines = [
    `Agent controlled write intent gateway: ${report.readiness}`,
    `Gateway: ${report.gateway.gatewayId ?? "missing"}`,
    `Mode: ${report.gateway.gatewayMode ?? "missing"}`,
    `Accepted intents: ${report.acceptedIntents.map((intent) => intent.intentId).join(",")}`,
    `Execution candidates: ${report.controlledWriteBoundary.executionCandidateAllowed ? "enabled" : "disabled"}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function intentsMatch(intents = []) {
  if (!Array.isArray(intents) || intents.length !== requiredIntentIds.length) return false;
  return requiredIntentIds.every((intentId) => {
    const intent = intents.find((candidate) => candidate.intentId === intentId);
    return intent?.approvalRequired === true &&
      intent?.directDatabaseWriteAllowed === false &&
      intent?.executionCandidateAllowed === false &&
      intent?.finalEvaluationWriteAllowed === false &&
      intent?.commandPort?.idempotencyKeyRequired === true &&
      intent?.commandPort?.outboxEventRequired === true &&
      Array.isArray(intent?.rootRequirementAnchors) &&
      intent.rootRequirementAnchors.length > 0;
  });
}

function summarizeIntentReports(intents = []) {
  if (!Array.isArray(intents)) return [];
  return intents.map((intent) => ({
    intentId: intent.intentId,
    workerAgent: intent.workerAgent,
    taskKind: intent.taskKind,
    targetCapability: intent.targetCapability,
    commandPort: `${intent.commandPort?.portName ?? "missing"}.${intent.commandPort?.operation ?? "missing"}`,
    approvalRequired: Boolean(intent.approvalRequired),
    executionCandidateAllowed: Boolean(intent.executionCandidateAllowed),
  }));
}

function summarizeIntents(intents = []) {
  if (!Array.isArray(intents) || intents.length === 0) return "missing";
  return intents.map((intent) =>
    `${intent.intentId}:${intent.workerAgent}:${intent.commandPort?.portName}.${intent.commandPort?.operation}:approval=${intent.approvalRequired}:execute=${intent.executionCandidateAllowed}`,
  ).join(";");
}

function summarizeWriteBoundary(boundary = {}) {
  return [
    `record=${boundary.commandIntentRecordingAllowed}`,
    `businessWrite=${boundary.immediateBusinessWriteAllowed}`,
    `directDb=${boundary.directDatabaseWriteAllowed}`,
    `localTool=${boundary.localToolMutationAllowed}`,
    `finalGrading=${boundary.finalAiGradingWriteAllowed}`,
    `workflowPublish=${boundary.workflowPublishAllowed}`,
    `modelTraining=${boundary.modelTrainingWriteAllowed}`,
    `rejection=${boundary.rejectionMode}`,
  ].join(";");
}

function summarizeHarnessBoundary(boundary = {}, executionCandidateViewSchema = {}) {
  return [
    `harness=${boundary.harnessApprovalRequired}`,
    `artifact=${boundary.approvalArtifactRequired}`,
    `decision=${boundary.approvalDecisionRequiredBeforeExecution}`,
    `candidate=${boundary.executionCandidateAllowed}`,
    `viewCount=${executionCandidateViewSchema.properties?.candidateCount?.const}`,
    `viewMax=${executionCandidateViewSchema.properties?.candidates?.maxItems}`,
    `reason=${boundary.executionDisabledReason}`,
  ].join(";");
}

function summarizeEventing(eventing = {}) {
  return [
    `appendOnly=${eventing.appendOnlyEventRequired}`,
    `outbox=${eventing.outboxRequired}`,
    `beforeExecution=${eventing.eventBeforeExecutionRequired}`,
    `types=${Array.isArray(eventing.requiredEventTypes) ? eventing.requiredEventTypes.join("|") : "missing"}`,
  ].join(";");
}

function summarizeTaskApproval(tasks = []) {
  if (!Array.isArray(tasks) || tasks.length === 0) return "missing";
  return tasks.map((task) =>
    `${task.taskId}:kind=${task.taskKind}:write=${task.writeIntent}:approval=${task.requiresHumanApproval}:anchors=${(task.rootRequirementAnchors ?? []).join("|")}`,
  ).join(";");
}

function summarizeDangerousSkills(skills = []) {
  const dangerous = skills.filter((skill) => hasWriteOrMutationPermission(skill));
  if (dangerous.length === 0) return "none";
  return dangerous.map((skill) =>
    `${skill.skillId}:harness=${skill.harnessRequired}:directDb=${skill.directDatabaseWriteAllowed}:rollback=${skill.evidencePolicy?.requiredEvidenceRefs?.includes("ROLLBACK")}`,
  ).join(";");
}

function summarizePromotion(promotion = {}) {
  return [
    `class=${promotion.currentEvidenceClass}`,
    `root=${promotion.rootWorkflowRequired}`,
    `businessWrite=${promotion.businessWriteExecutionClaimAllowed}`,
    `finalGrading=${promotion.finalAiGradingClaimAllowed}`,
    `workflowPublish=${promotion.workflowPublishClaimAllowed}`,
    `localTool=${promotion.localToolMutationClaimAllowed}`,
  ].join(";");
}

function summarizeBooleanMap(value = {}) {
  return Object.entries(value).map(([key, item]) => `${key}=${item}`).join(";");
}

function hasWriteOrMutationPermission(skill = {}) {
  const permissions = Array.isArray(skill.requiredPermissions) ? skill.requiredPermissions : [];
  return permissions.some((permission) => [
    "TEACHING_WRITE",
    "STUDENT_ARCHIVE_WRITE",
    "RESEARCH_WRITE",
    "WORKFLOW_PUBLISH",
    "FILE_WRITE",
    "PROCESS_START",
    "BROWSER_NAVIGATE",
    "EXTERNAL_APP_CONTROL",
    "MODEL_EXPERIMENT",
    "MODEL_TRAINING",
  ].includes(permission));
}

function allTrue(value = {}, keys = []) {
  return keys.every((key) => value?.[key] === true);
}

function hasAll(values = [], required = []) {
  return required.every((item) => values.includes(item));
}

function addFinding(findings, finding) {
  findings.push({
    id: finding.id,
    passed: Boolean(finding.passed),
    severity: finding.passed ? "info" : "error",
    actual: finding.actual ?? null,
    expected: finding.expected,
    remediation: finding.remediation,
  });
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(contractFiles).map(([key, relativePath]) => [
    key,
    JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
  ]));
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditAgentControlledWriteIntentGateway(loadCurrentInputs(root));
    writeReport(root, args.outPath, report);
    console.log(formatAgentControlledWriteIntentGatewayAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
