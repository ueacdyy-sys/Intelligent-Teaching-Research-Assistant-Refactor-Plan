import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WORKFLOW_JSON_FILES = {
  draftSchema: "contracts/workflow/workflow-plugin-draft.schema.json",
  sandboxRunSchema: "contracts/workflow/workflow-plugin-sandbox-run.schema.json",
  approvalSchema: "contracts/workflow/workflow-plugin-approval.schema.json",
  registryEntrySchema: "contracts/workflow/workflow-plugin-registry-entry.schema.json",
};

const WORKFLOW_EXAMPLE_FILES = {
  workflowDraft: "contracts/workflow/workflow-draft.example.json",
  pluginDraft: "contracts/workflow/plugin-draft.example.json",
  sandboxRun: "contracts/workflow/workflow-plugin-sandbox-run.example.json",
  approval: "contracts/workflow/workflow-plugin-approval.example.json",
  registryEntry: "contracts/workflow/workflow-plugin-registry-entry.example.json",
};

export function auditWorkflowPluginFlowContracts(inputs) {
  const findings = [];
  const draftSchema = inputs.draftSchema ?? {};
  const sandboxRunSchema = inputs.sandboxRunSchema ?? {};
  const approvalSchema = inputs.approvalSchema ?? {};
  const registryEntrySchema = inputs.registryEntrySchema ?? {};
  const examples = inputs.examples ?? {};

  addFinding(findings, {
    id: "draft.artifact_kinds",
    passed: hasAll(enumValues(draftSchema, "artifactKind"), ["WORKFLOW", "PLUGIN"]),
    actual: enumValues(draftSchema, "artifactKind").join(","),
    expected: "WORKFLOW,PLUGIN",
    remediation: "Drafts must model both workflow and plugin generated artifacts.",
  });

  addFinding(findings, {
    id: "draft.origin.task_failure_learning",
    passed: enumValues(draftSchema, "origin").includes("TASK_FAILURE_LEARNING"),
    actual: enumValues(draftSchema, "origin").join(","),
    expected: "TASK_FAILURE_LEARNING",
    remediation: "Plugin drafts must support task-failure-learning origin.",
  });

  addFinding(findings, {
    id: "draft.generated_review_only",
    passed: hasAll(requiredFields(draftSchema), [
      "userIntent",
      "generatedFiles",
      "executionMode",
      "sandboxRequired",
      "humanApprovalRequired",
    ]) &&
      draftSchema.properties?.executionMode?.const === "DRY_RUN_ONLY" &&
      draftSchema.properties?.sandboxRequired?.const === true &&
      draftSchema.properties?.humanApprovalRequired?.const === true,
    actual: summarizeDraftSafety(draftSchema),
    expected: "generated files + DRY_RUN_ONLY + sandbox + human approval",
    remediation: "Generated drafts must remain review-only before sandbox and approval.",
  });

  addFinding(findings, {
    id: "draft.not_manual_node_graph",
    passed: !draftSchema.properties?.nodes && !draftSchema.properties?.edges,
    actual: summarizeManualGraphFields(draftSchema),
    expected: "no manual node/edge graph contract",
    remediation: "Workflow mode must stay natural-language-to-generated-code, not manual node graph editing.",
  });

  addFinding(findings, {
    id: "sandbox.executed_in_sandbox",
    passed: sandboxRunSchema.properties?.executedInSandbox?.const === true &&
      requiredFields(sandboxRunSchema).includes("executedInSandbox"),
    actual: sandboxRunSchema.properties?.executedInSandbox?.const,
    expected: true,
    remediation: "Generated artifacts must be tested in sandbox before review.",
  });

  addFinding(findings, {
    id: "sandbox.no_host_write",
    passed: sandboxRunSchema.properties?.noHostWrite?.const === true &&
      requiredFields(sandboxRunSchema).includes("noHostWrite"),
    actual: sandboxRunSchema.properties?.noHostWrite?.const,
    expected: true,
    remediation: "Sandbox runs must not write to the host in this slice.",
  });

  addFinding(findings, {
    id: "sandbox.network_default_deny",
    passed: sandboxRunSchema.properties?.networkPolicy?.const === "DEFAULT_DENY",
    actual: sandboxRunSchema.properties?.networkPolicy?.const,
    expected: "DEFAULT_DENY",
    remediation: "Generated-code sandbox networking must be default-deny.",
  });

  addFinding(findings, {
    id: "sandbox.status_vocab",
    passed: hasAll(enumValues(sandboxRunSchema, "status"), ["PASS", "FAIL"]),
    actual: enumValues(sandboxRunSchema, "status").join(","),
    expected: "PASS,FAIL",
    remediation: "Sandbox result status must distinguish passing and failing generated tests.",
  });

  addFinding(findings, {
    id: "approval.requires_performance_and_effect_review",
    passed: approvalSchema.properties?.performanceReviewed?.const === true &&
      approvalSchema.properties?.effectReviewed?.const === true &&
      hasAll(requiredFields(approvalSchema), ["performanceReviewed", "effectReviewed"]),
    actual: `performance=${stringifyScalar(approvalSchema.properties?.performanceReviewed?.const)} effect=${stringifyScalar(approvalSchema.properties?.effectReviewed?.const)}`,
    expected: "performance=true effect=true",
    remediation: "Human approval must cover both performance and effect.",
  });

  addFinding(findings, {
    id: "approval.decision_vocab",
    passed: hasAll(enumValues(approvalSchema, "decision"), ["APPROVED", "REJECTED", "REVISION_REQUESTED"]),
    actual: enumValues(approvalSchema, "decision").join(","),
    expected: "APPROVED,REJECTED,REVISION_REQUESTED",
    remediation: "Approval must support approve, reject, and revision decisions.",
  });

  addFinding(findings, {
    id: "registry.requires_sandbox_and_approval",
    passed: hasAll(requiredFields(registryEntrySchema), ["sandboxRunId", "approvalId", "rollbackPlan"]),
    actual: requiredFields(registryEntrySchema).join(","),
    expected: "sandboxRunId,approvalId,rollbackPlan",
    remediation: "Registry entries must be traceable to sandbox evidence and human approval.",
  });

  addFinding(findings, {
    id: "registry.review_only_execution",
    passed: registryEntrySchema.properties?.executionMode?.const === "DRY_RUN_ONLY" &&
      registryEntrySchema.properties?.localExecutionEnabled?.const === false,
    actual: `executionMode=${stringifyScalar(registryEntrySchema.properties?.executionMode?.const)} localExecutionEnabled=${stringifyScalar(registryEntrySchema.properties?.localExecutionEnabled?.const)}`,
    expected: "DRY_RUN_ONLY and localExecutionEnabled=false",
    remediation: "Registry save must not enable local generated-code execution in this slice.",
  });

  addFinding(findings, {
    id: "examples.workflow_generated",
    passed: examples.workflowDraft?.artifactKind === "WORKFLOW" &&
      examples.workflowDraft?.origin === "USER_REQUEST" &&
      examples.workflowDraft?.executionMode === "DRY_RUN_ONLY" &&
      examples.workflowDraft?.sandboxRequired === true &&
      examples.workflowDraft?.humanApprovalRequired === true,
    actual: summarizeExample(examples.workflowDraft),
    expected: "workflow USER_REQUEST dry-run sandbox approval",
    remediation: "Workflow example must show generated review-only workflow draft.",
  });

  addFinding(findings, {
    id: "examples.plugin_failure_learning",
    passed: examples.pluginDraft?.artifactKind === "PLUGIN" &&
      examples.pluginDraft?.origin === "TASK_FAILURE_LEARNING" &&
      ["MCP_TOOL", "SKILL", "SCRIPT"].includes(examples.pluginDraft?.capabilityKind) &&
      Boolean(examples.pluginDraft?.failureContext?.taskFailureId),
    actual: summarizeExample(examples.pluginDraft),
    expected: "plugin TASK_FAILURE_LEARNING MCP/Skill/Script failure context",
    remediation: "Plugin example must prove self-evolution from task failure learning.",
  });

  addFinding(findings, {
    id: "examples.registry_links_approval_and_sandbox",
    passed: examples.registryEntry?.approvalId === examples.approval?.approvalId &&
      examples.registryEntry?.sandboxRunId === examples.sandboxRun?.runId &&
      examples.registryEntry?.draftId === examples.workflowDraft?.draftId &&
      examples.approval?.registrySaveDecision === "ALLOW_SAVE",
    actual: summarizeRegistryLinks(examples),
    expected: "registry links draft + sandbox run + approval",
    remediation: "Registry example must remain linked to generated draft, sandbox evidence, and approval.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    findings,
  };
}

export function formatWorkflowPluginFlowAudit(report) {
  const lines = [
    `Workflow Plugin flow: ${report.readiness}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(
      `- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`,
    );
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
}

function loadCurrentInputs(root) {
  return {
    ...Object.fromEntries(
      Object.entries(WORKFLOW_JSON_FILES).map(([key, relativePath]) => [
        key,
        JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
      ]),
    ),
    examples: Object.fromEntries(
      Object.entries(WORKFLOW_EXAMPLE_FILES).map(([key, relativePath]) => [
        key,
        JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
      ]),
    ),
  };
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

function requiredFields(schema) {
  return Array.isArray(schema.required) ? schema.required : [];
}

function enumValues(schema, propertyName) {
  const values = schema.properties?.[propertyName]?.enum;
  return Array.isArray(values) ? values : [];
}

function hasAll(values, required) {
  return required.every((value) => values.includes(value));
}

function summarizeDraftSafety(schema) {
  return [
    `required=${requiredFields(schema).filter((field) => ["userIntent", "generatedFiles", "executionMode", "sandboxRequired", "humanApprovalRequired"].includes(field)).join(",")}`,
    `executionMode=${stringifyScalar(schema.properties?.executionMode?.const)}`,
    `sandboxRequired=${stringifyScalar(schema.properties?.sandboxRequired?.const)}`,
    `humanApprovalRequired=${stringifyScalar(schema.properties?.humanApprovalRequired?.const)}`,
  ].join(" ");
}

function summarizeManualGraphFields(schema) {
  const fields = [];
  if (schema.properties?.nodes) fields.push("nodes");
  if (schema.properties?.edges) fields.push("edges");
  return fields.length === 0 ? "none" : fields.join(",");
}

function summarizeExample(example) {
  if (!example) return "missing";
  return [
    `artifactKind=${stringifyScalar(example.artifactKind)}`,
    `origin=${stringifyScalar(example.origin)}`,
    `capabilityKind=${stringifyScalar(example.capabilityKind)}`,
    `executionMode=${stringifyScalar(example.executionMode)}`,
  ].join(" ");
}

function summarizeRegistryLinks(examples) {
  return [
    `registry.approvalId=${stringifyScalar(examples.registryEntry?.approvalId)}`,
    `approval.approvalId=${stringifyScalar(examples.approval?.approvalId)}`,
    `registry.sandboxRunId=${stringifyScalar(examples.registryEntry?.sandboxRunId)}`,
    `sandbox.runId=${stringifyScalar(examples.sandboxRun?.runId)}`,
    `registry.draftId=${stringifyScalar(examples.registryEntry?.draftId)}`,
    `draft.draftId=${stringifyScalar(examples.workflowDraft?.draftId)}`,
  ].join(" ");
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  return String(value);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? undefined : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditWorkflowPluginFlowContracts(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatWorkflowPluginFlowAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
