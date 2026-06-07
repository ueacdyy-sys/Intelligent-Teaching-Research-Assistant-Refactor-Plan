import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const AGENT_CONTRACT_FILES = {
  skillSchema: "contracts/agent/skill-manifest.schema.json",
  skillExamples: "contracts/agent/skill-manifest.examples.json",
  sharedContextSchema: "contracts/agent/shared-context.schema.json",
  sharedContextExample: "contracts/agent/shared-context.example.json",
  agentTaskSchema: "contracts/agent/agent-task.schema.json",
  agentTaskExample: "contracts/agent/agent-task.example.json",
  routeDecisionSchema: "contracts/agent/agent-route-decision.schema.json",
  routeDecisionExample: "contracts/agent/agent-route-decision.example.json",
  guardrailResultSchema: "contracts/agent/guardrail-result.schema.json",
  guardrailResultExample: "contracts/agent/guardrail-result.example.json",
  searchTeachingMaterialInputSchema: "contracts/agent/skills/search-teaching-material.input.schema.json",
  searchTeachingMaterialOutputSchema: "contracts/agent/skills/search-teaching-material.output.schema.json",
  searchTeachingMaterialInputExample: "contracts/agent/skills/search-teaching-material.input.example.json",
  searchTeachingMaterialOutputExample: "contracts/agent/skills/search-teaching-material.output.example.json",
  teachingReadonlyAdapterSchema: "contracts/agent/teaching-agent-readonly-adapter.schema.json",
  teachingReadonlyAdapterExample: "contracts/agent/teaching-agent-readonly-adapter.example.json",
};

const REQUIRED_DOMAINS = [
  "Teaching",
  "StudentTutor",
  "Research",
  "Analysis",
  "Workflow",
  "ToolControl",
  "ModelExperiment",
];
const REQUIRED_ROUTE_MODES = ["SINGLE_WORKER", "SWARM"];
const REQUIRED_GUARDRAIL_DECISIONS = ["ALLOW", "APPROVAL_REQUIRED", "DENY"];
const DANGEROUS_PERMISSIONS = new Set([
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
]);

export function auditAgentSkillContracts(inputs) {
  const findings = [];
  const skillSchema = inputs.skillSchema ?? {};
  const skills = Array.isArray(inputs.skillExamples?.skills) ? inputs.skillExamples.skills : [];
  const sharedContextSchema = inputs.sharedContextSchema ?? {};
  const sharedContextExample = inputs.sharedContextExample ?? {};
  const taskSchema = inputs.agentTaskSchema ?? {};
  const tasks = Array.isArray(inputs.agentTaskExample?.tasks) ? inputs.agentTaskExample.tasks : [];
  const routeSchema = inputs.routeDecisionSchema ?? {};
  const routeDecisions = Array.isArray(inputs.routeDecisionExample?.decisions)
    ? inputs.routeDecisionExample.decisions
    : [];
  const guardrailSchema = inputs.guardrailResultSchema ?? {};
  const guardrailResults = Array.isArray(inputs.guardrailResultExample?.results)
    ? inputs.guardrailResultExample.results
    : [];
  const searchTeachingSkill = skills.find((skill) => skill.skillId === "search_teaching_material");
  const searchTeachingMaterialInputSchema = inputs.searchTeachingMaterialInputSchema ?? {};
  const searchTeachingMaterialOutputSchema = inputs.searchTeachingMaterialOutputSchema ?? {};
  const searchTeachingMaterialInputExample = inputs.searchTeachingMaterialInputExample ?? {};
  const searchTeachingMaterialOutputExample = inputs.searchTeachingMaterialOutputExample ?? {};
  const teachingReadonlyAdapterSchema = inputs.teachingReadonlyAdapterSchema ?? {};
  const teachingReadonlyAdapterExample = inputs.teachingReadonlyAdapterExample ?? {};

  addFinding(findings, {
    id: "skill.schema_version",
    passed: skillSchema.properties?.schemaVersion?.const === "2026-06-04.agent.skill-manifest.v1",
    actual: skillSchema.properties?.schemaVersion?.const,
    expected: "2026-06-04.agent.skill-manifest.v1",
    remediation: "Keep Skill Manifest on the current v1 contract before adding runtime adapters.",
  });

  addFinding(findings, {
    id: "skill.no_direct_database_write_schema",
    passed: skillSchema.properties?.directDatabaseWriteAllowed?.const === false &&
      requiredFields(skillSchema).includes("directDatabaseWriteAllowed"),
    actual: skillSchema.properties?.directDatabaseWriteAllowed?.const,
    expected: false,
    remediation: "Agent Skills must never advertise direct main-database writes.",
  });

  addFinding(findings, {
    id: "skill.domain_coverage",
    passed: hasAll(skills.map((skill) => skill.domain), REQUIRED_DOMAINS),
    actual: unique(skills.map((skill) => skill.domain)).join(","),
    expected: REQUIRED_DOMAINS.join(","),
    remediation: "Cover Teaching, StudentTutor, Research, Analysis, Workflow, ToolControl, and ModelExperiment skills.",
  });

  addFinding(findings, {
    id: "skill.examples_no_direct_database_write",
    passed: skills.length > 0 && skills.every((skill) => skill.directDatabaseWriteAllowed === false),
    actual: summarizeDirectDatabaseWrite(skills),
    expected: "all directDatabaseWriteAllowed=false",
    remediation: "Every example Skill must return through ports, events, or Harness rather than writing the main database directly.",
  });

  addFinding(findings, {
    id: "skill.dangerous_permissions_require_harness",
    passed: skills.length > 0 && skills.every((skill) => !hasDangerousPermission(skill) || skill.harnessRequired === true),
    actual: summarizeDangerousHarness(skills),
    expected: "dangerous permissions require harnessRequired=true",
    remediation: "File writes, process starts, browser/app control, workflow publish, model experiments, and business writes must pass Harness.",
  });

  addFinding(findings, {
    id: "skill.evidence_policy_required",
    passed: skills.length > 0 && skills.every((skill) =>
      skill.evidencePolicy?.required === true &&
      skill.evidencePolicy?.traceRequired === true &&
      Array.isArray(skill.evidencePolicy?.requiredEvidenceRefs) &&
      skill.evidencePolicy.requiredEvidenceRefs.length > 0
    ),
    actual: summarizeEvidencePolicy(skills),
    expected: "required=true traceRequired=true refs>0",
    remediation: "Every Skill must leave source, permission, SLO, or rollback evidence for later audit.",
  });

  addFinding(findings, {
    id: "skill.progressive_disclosure",
    passed: skills.length > 0 && skills.every((skill) =>
      ["SUMMARY_FIRST", "MANIFEST_THEN_SCHEMA"].includes(skill.disclosureLevel)
    ),
    actual: unique(skills.map((skill) => skill.disclosureLevel)).join(","),
    expected: "SUMMARY_FIRST or MANIFEST_THEN_SCHEMA",
    remediation: "Skill discovery must stay summary-first to avoid loading every tool schema into the prompt.",
  });

  addFinding(findings, {
    id: "teaching_readonly_skill.schema_refs",
    passed: searchTeachingSkill?.inputSchemaRef === "contracts/agent/skills/search-teaching-material.input.schema.json" &&
      searchTeachingSkill?.outputSchemaRef === "contracts/agent/skills/search-teaching-material.output.schema.json" &&
      searchTeachingMaterialInputSchema.properties?.schemaVersion?.const === "2026-06-04.agent.skill.search-teaching-material.input.v1" &&
      searchTeachingMaterialOutputSchema.properties?.schemaVersion?.const === "2026-06-04.agent.skill.search-teaching-material.output.v1",
    actual: summarizeTeachingReadonlySchemaRefs(
      searchTeachingSkill,
      searchTeachingMaterialInputSchema,
      searchTeachingMaterialOutputSchema,
    ),
    expected: "manifest refs resolve to search-teaching-material input/output v1 schemas",
    remediation: "TeachingAgent search_teaching_material must point to concrete input/output schemas before runtime code can invoke it.",
  });

  addFinding(findings, {
    id: "teaching_readonly_skill.input_boundary",
    passed: requiredFields(searchTeachingMaterialInputSchema).includes("contextRef") &&
      searchTeachingMaterialInputSchema.properties?.latencyBudgetMs?.maximum === 50 &&
      searchTeachingMaterialInputSchema.properties?.writeIntent?.const === false &&
      searchTeachingMaterialInputSchema.properties?.studentDataAccess?.const === "NONE" &&
      searchTeachingMaterialInputSchema.properties?.externalModelAllowed?.const === false &&
      searchTeachingMaterialInputSchema.properties?.filters?.properties?.ownerType?.const === "TEACHING" &&
      searchTeachingMaterialInputSchema.properties?.filters?.properties?.includeStudentArchive?.const === false,
    actual: summarizeTeachingReadonlyInputBoundary(searchTeachingMaterialInputSchema),
    expected: "contextRef required, p99<=50, writeIntent=false, no student archive, no external model",
    remediation: "TeachingAgent read-only search must be bound to SharedContext and must not request writes, student archives, or external model calls.",
  });

  addFinding(findings, {
    id: "teaching_readonly_skill.output_boundary",
    passed: requiredFields(searchTeachingMaterialOutputSchema).includes("evidenceRefs") &&
      searchTeachingMaterialOutputSchema.properties?.items?.items?.properties?.ownerType?.const === "TEACHING" &&
      searchTeachingMaterialOutputSchema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const === false &&
      searchTeachingMaterialOutputSchema.properties?.safety?.properties?.studentDataReturned?.const === false &&
      searchTeachingMaterialOutputSchema.properties?.safety?.properties?.externalModelUsed?.const === false &&
      searchTeachingMaterialOutputSchema.properties?.slo?.properties?.p99BudgetMs?.maximum === 50 &&
      searchTeachingMaterialOutputSchema.properties?.slo?.properties?.runtimeEvidenceRequiredBeforePromotion?.const === true,
    actual: summarizeTeachingReadonlyOutputBoundary(searchTeachingMaterialOutputSchema),
    expected: "teaching-only results, evidence refs, no direct DB writes, no student data, no external model, runtime evidence required",
    remediation: "TeachingAgent read-only search output must return cited teaching materials and safety/SLO evidence only.",
  });

  addFinding(findings, {
    id: "teaching_readonly_skill.examples_safe_fast_path",
    passed: searchTeachingMaterialInputExample.schemaVersion ===
      searchTeachingMaterialInputSchema.properties?.schemaVersion?.const &&
      searchTeachingMaterialOutputExample.schemaVersion ===
        searchTeachingMaterialOutputSchema.properties?.schemaVersion?.const &&
      searchTeachingMaterialInputExample.writeIntent === false &&
      searchTeachingMaterialInputExample.filters?.ownerType === "TEACHING" &&
      searchTeachingMaterialInputExample.filters?.includeStudentArchive === false &&
      searchTeachingMaterialInputExample.studentDataAccess === "NONE" &&
      searchTeachingMaterialInputExample.externalModelAllowed === false &&
      searchTeachingMaterialInputExample.latencyBudgetMs <= 50 &&
      searchTeachingMaterialOutputExample.safety?.directDatabaseWriteAllowed === false &&
      searchTeachingMaterialOutputExample.safety?.studentDataReturned === false &&
      searchTeachingMaterialOutputExample.safety?.externalModelUsed === false &&
      searchTeachingMaterialOutputExample.slo?.p99BudgetMs <= 50 &&
      searchTeachingMaterialOutputExample.slo?.runtimeEvidenceRequiredBeforePromotion === true &&
      Array.isArray(searchTeachingMaterialOutputExample.evidenceRefs) &&
      searchTeachingMaterialOutputExample.evidenceRefs.length > 0,
    actual: summarizeTeachingReadonlyExamples(
      searchTeachingMaterialInputExample,
      searchTeachingMaterialOutputExample,
    ),
    expected: "examples are read-only, teaching-only, evidence-backed, and <=50ms budget",
    remediation: "TeachingAgent read-only examples must prove the fast path is safe before runtime adapters are added.",
  });

  addFinding(findings, {
    id: "teaching_readonly_adapter.schema_and_identity",
    passed: teachingReadonlyAdapterSchema.properties?.schemaVersion?.const ===
      "2026-06-04.agent.teaching-readonly-adapter.v1" &&
      teachingReadonlyAdapterSchema.properties?.adapterId?.const ===
        "teaching_agent_search_material_readonly_adapter" &&
      teachingReadonlyAdapterSchema.properties?.workerAgent?.const === "TeachingAgent" &&
      teachingReadonlyAdapterSchema.properties?.skillId?.const === "search_teaching_material" &&
      teachingReadonlyAdapterSchema.properties?.routeMode?.const === "SINGLE_WORKER" &&
      teachingReadonlyAdapterSchema.properties?.inputSchemaRef?.const ===
        "contracts/agent/skills/search-teaching-material.input.schema.json" &&
      teachingReadonlyAdapterSchema.properties?.outputSchemaRef?.const ===
        "contracts/agent/skills/search-teaching-material.output.schema.json" &&
      teachingReadonlyAdapterExample.adapterId === "teaching_agent_search_material_readonly_adapter" &&
      teachingReadonlyAdapterExample.workerAgent === "TeachingAgent" &&
      teachingReadonlyAdapterExample.skillId === "search_teaching_material" &&
      teachingReadonlyAdapterExample.routeMode === "SINGLE_WORKER",
    actual: summarizeTeachingReadonlyAdapterIdentity(teachingReadonlyAdapterSchema, teachingReadonlyAdapterExample),
    expected: "TeachingAgent SINGLE_WORKER adapter bound to search_teaching_material input/output schemas",
    remediation: "TeachingAgent read-only runtime adapters must stay bound to the checked search_teaching_material contracts.",
  });

  addFinding(findings, {
    id: "teaching_readonly_adapter.read_port",
    passed: teachingReadonlyAdapterSchema.properties?.readPort?.properties?.portName?.const ===
      "TeachingArchiveReadPort" &&
      teachingReadonlyAdapterSchema.properties?.readPort?.properties?.operation?.const ===
        "searchTeachingMaterials" &&
      teachingReadonlyAdapterSchema.properties?.readPort?.properties?.directDatabaseAccessAllowed?.const ===
        false &&
      teachingReadonlyAdapterSchema.properties?.readPort?.properties?.writeOperationAllowed?.const === false &&
      teachingReadonlyAdapterExample.readPort?.portName === "TeachingArchiveReadPort" &&
      teachingReadonlyAdapterExample.readPort?.operation === "searchTeachingMaterials" &&
      teachingReadonlyAdapterExample.readPort?.directDatabaseAccessAllowed === false &&
      teachingReadonlyAdapterExample.readPort?.writeOperationAllowed === false,
    actual: summarizeTeachingReadonlyAdapterReadPort(teachingReadonlyAdapterSchema, teachingReadonlyAdapterExample),
    expected: "read port is TeachingArchiveReadPort.searchTeachingMaterials with no direct DB access or writes",
    remediation: "TeachingAgent search_teaching_material must call a read port instead of reaching into database or write adapters.",
  });

  addFinding(findings, {
    id: "teaching_readonly_adapter.guards_and_scopes",
    passed: teachingReadonlyAdapterSchema.properties?.guards?.properties?.principalContextRequired?.const === true &&
      teachingReadonlyAdapterSchema.properties?.guards?.properties?.sharedContextRequired?.const === true &&
      teachingReadonlyAdapterSchema.properties?.guards?.properties?.guardrailResultRequired?.const === true &&
      teachingReadonlyAdapterSchema.properties?.guards?.properties?.denyOnWriteIntent?.const === true &&
      teachingReadonlyAdapterSchema.properties?.guards?.properties?.denyOnStudentArchiveRequest?.const === true &&
      teachingReadonlyAdapterSchema.properties?.guards?.properties?.denyOnExternalModelRequest?.const === true &&
      adapterDataScopesMatch(teachingReadonlyAdapterSchema.properties?.guards?.properties?.dataScopes?.properties) &&
      teachingReadonlyAdapterExample.guards?.principalContextRequired === true &&
      teachingReadonlyAdapterExample.guards?.sharedContextRequired === true &&
      teachingReadonlyAdapterExample.guards?.guardrailResultRequired === true &&
      teachingReadonlyAdapterExample.guards?.denyOnWriteIntent === true &&
      teachingReadonlyAdapterExample.guards?.denyOnStudentArchiveRequest === true &&
      teachingReadonlyAdapterExample.guards?.denyOnExternalModelRequest === true &&
      exampleDataScopesMatch(teachingReadonlyAdapterExample.guards?.dataScopes),
    actual: summarizeTeachingReadonlyAdapterGuards(teachingReadonlyAdapterSchema, teachingReadonlyAdapterExample),
    expected: "principal/shared context/guardrail required; write, student archive, and external model requests denied",
    remediation: "TeachingAgent read-only adapters must keep Teaching READ only, Student NONE, and LocalTool NONE.",
  });

  addFinding(findings, {
    id: "teaching_readonly_adapter.evidence_slo_promotion",
    passed: adapterEvidenceSchemaReady(teachingReadonlyAdapterSchema.properties?.evidence?.properties) &&
      teachingReadonlyAdapterSchema.properties?.slo?.properties?.p99BudgetMs?.maximum === 50 &&
      teachingReadonlyAdapterSchema.properties?.promotion?.properties?.currentEvidenceClass?.const ===
        "CONTRACT_ONLY" &&
      teachingReadonlyAdapterSchema.properties?.promotion?.properties?.runtimeEvidenceRequiredBeforePromotion?.const ===
        true &&
      teachingReadonlyAdapterSchema.properties?.promotion?.properties?.rootWorkflowRequired?.const === true &&
      adapterEvidenceExampleReady(teachingReadonlyAdapterExample.evidence) &&
      teachingReadonlyAdapterExample.slo?.p99BudgetMs <= 50 &&
      teachingReadonlyAdapterExample.promotion?.currentEvidenceClass === "CONTRACT_ONLY" &&
      teachingReadonlyAdapterExample.promotion?.runtimeEvidenceRequiredBeforePromotion === true &&
      teachingReadonlyAdapterExample.promotion?.rootWorkflowRequired === true,
    actual: summarizeTeachingReadonlyAdapterEvidence(teachingReadonlyAdapterSchema, teachingReadonlyAdapterExample),
    expected: "trace/input/output/source/timing evidence, p99<=50, and runtime evidence required before promotion",
    remediation: "TeachingAgent read-only adapters need runtime timing and evidence gates before promotion beyond contract-only.",
  });

  addFinding(findings, {
    id: "shared_context.required_boundary_fields",
    passed: hasAll(requiredFields(sharedContextSchema), [
      "principalContextRef",
      "sessionId",
      "taskId",
      "rootRequirementAnchors",
      "dataScopes",
      "evidenceRefs",
      "redactionState",
      "tokenBudget",
      "latencyBudgetMs",
      "memoryRefs",
      "expirationPolicy",
    ]),
    actual: requiredFields(sharedContextSchema).join(","),
    expected: "principal/session/task/root anchors/data scopes/evidence/redaction/budget/memory/expiration",
    remediation: "SharedContext must carry identity, evidence, privacy, budget, and expiry information across Agent boundaries.",
  });

  addFinding(findings, {
    id: "shared_context.example_root_and_budget",
    passed: Array.isArray(sharedContextExample.rootRequirementAnchors) &&
      sharedContextExample.rootRequirementAnchors.length > 0 &&
      sharedContextExample.latencyBudgetMs <= 50 &&
      sharedContextExample.expirationPolicy?.deleteOnRevoke === true,
    actual: `anchors=${sharedContextExample.rootRequirementAnchors?.length ?? 0};p99=${sharedContextExample.latencyBudgetMs};deleteOnRevoke=${sharedContextExample.expirationPolicy?.deleteOnRevoke}`,
    expected: "root anchors present, latencyBudgetMs<=50, deleteOnRevoke=true",
    remediation: "SharedContext examples must stay tied to immutable root requirements and the production 50ms target.",
  });

  addFinding(findings, {
    id: "task.required_routing_fields",
    passed: hasAll(requiredFields(taskSchema), [
      "requestedByPrincipalId",
      "principalContextRef",
      "userIntent",
      "taskKind",
      "riskLevel",
      "writeIntent",
      "requiresHumanApproval",
      "routePolicy",
      "budgets",
    ]),
    actual: requiredFields(taskSchema).join(","),
    expected: "principal/intent/kind/risk/write/approval/route/budget",
    remediation: "AgentTask must expose the fields LeadAgent needs before routing work.",
  });

  addFinding(findings, {
    id: "task.write_intent_requires_approval_example",
    passed: tasks.some((task) => task.writeIntent === true && task.requiresHumanApproval === true),
    actual: summarizeTaskApproval(tasks),
    expected: "at least one writeIntent=true example with requiresHumanApproval=true",
    remediation: "Teaching writes and generated artifacts must show the approval path in examples.",
  });

  addFinding(findings, {
    id: "route.schema_modes",
    passed: hasAll(enumValues(routeSchema, "mode"), REQUIRED_ROUTE_MODES),
    actual: enumValues(routeSchema, "mode").join(","),
    expected: REQUIRED_ROUTE_MODES.join(","),
    remediation: "RouteDecision must support both single-worker fast path and Swarm coordination.",
  });

  addFinding(findings, {
    id: "route.examples_single_and_swarm",
    passed: hasAll(routeDecisions.map((decision) => decision.mode), REQUIRED_ROUTE_MODES) &&
      routeDecisions.some(isValidSwarmDecision),
    actual: summarizeRouteDecisions(routeDecisions),
    expected: "SINGLE_WORKER and SWARM examples; SWARM has >=2 workers, rationale, fallback, and p99 budget",
    remediation: "Swarm must be explicit, budgeted, and fallback-aware rather than the default chat path.",
  });

  addFinding(findings, {
    id: "guardrail.decision_vocabulary",
    passed: hasAll(enumValues(guardrailSchema, "decision"), REQUIRED_GUARDRAIL_DECISIONS),
    actual: enumValues(guardrailSchema, "decision").join(","),
    expected: REQUIRED_GUARDRAIL_DECISIONS.join(","),
    remediation: "GuardrailResult must express allow, approval-required, and deny outcomes.",
  });

  addFinding(findings, {
    id: "guardrail.examples_decision_coverage",
    passed: hasAll(guardrailResults.map((result) => result.decision), REQUIRED_GUARDRAIL_DECISIONS),
    actual: unique(guardrailResults.map((result) => result.decision)).join(","),
    expected: REQUIRED_GUARDRAIL_DECISIONS.join(","),
    remediation: "Examples must prove the three guardrail outcomes before runtime implementation.",
  });

  addFinding(findings, {
    id: "guardrail.no_direct_database_write",
    passed: guardrailSchema.properties?.directDatabaseWriteAllowed?.const === false &&
      guardrailResults.every((result) => result.directDatabaseWriteAllowed === false),
    actual: summarizeGuardrailDirectDb(guardrailResults),
    expected: "schema const false and all examples false",
    remediation: "Guardrails must keep direct database writes impossible even for denied attempts.",
  });

  addFinding(findings, {
    id: "guardrail.high_risk_requires_harness_or_deny",
    passed: guardrailResults.every((result) =>
      result.decision === "ALLOW" || result.harnessActionRequired === true
    ),
    actual: summarizeGuardrailHarness(guardrailResults),
    expected: "non-ALLOW decisions require Harness action",
    remediation: "Approval and denial paths must bind to Harness evidence and rollback decisions.",
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness: findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION",
    workloadType: "AGENT_SKILL_CONTRACT_AUDIT",
    summary: {
      skillCount: skills.length,
      coveredDomains: unique(skills.map((skill) => skill.domain)),
      routeModes: unique(routeDecisions.map((decision) => decision.mode)),
      guardrailDecisions: unique(guardrailResults.map((result) => result.decision)),
      directDatabaseWriteAllowed: false,
      teachingReadOnlySkill: searchTeachingSkill ? {
        skillId: searchTeachingSkill.skillId,
        workerAgent: "TeachingAgent",
        schemaRefsReady: findings.find((finding) => finding.id === "teaching_readonly_skill.schema_refs")?.passed === true,
        inputBoundaryReady: findings.find((finding) => finding.id === "teaching_readonly_skill.input_boundary")?.passed === true,
        outputBoundaryReady: findings.find((finding) => finding.id === "teaching_readonly_skill.output_boundary")?.passed === true,
      } : null,
      teachingReadOnlyAdapter: teachingReadonlyAdapterExample.adapterId ? {
        adapterId: teachingReadonlyAdapterExample.adapterId,
        readPortReady: findings.find((finding) => finding.id === "teaching_readonly_adapter.read_port")?.passed === true,
        guardsReady: findings.find((finding) => finding.id === "teaching_readonly_adapter.guards_and_scopes")?.passed === true,
        evidenceSloReady: findings.find((finding) => finding.id === "teaching_readonly_adapter.evidence_slo_promotion")?.passed === true,
      } : null,
    },
    findings,
  };
}

export function formatAgentSkillContractAudit(report) {
  const lines = [
    `Agent Skill contracts: ${report.readiness}`,
    `Skills: ${report.summary.skillCount}`,
    `Domains: ${report.summary.coveredDomains.join(",")}`,
    `Route modes: ${report.summary.routeModes.join(",")}`,
    `Guardrails: ${report.summary.guardrailDecisions.join(",")}`,
    `Teaching read-only skill: ${report.summary.teachingReadOnlySkill?.skillId ?? "missing"}`,
    `Teaching read-only adapter: ${report.summary.teachingReadOnlyAdapter?.adapterId ?? "missing"}`,
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
  return Object.fromEntries(
    Object.entries(AGENT_CONTRACT_FILES).map(([key, relativePath]) => [
      key,
      JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
    ]),
  );
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

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null))];
}

function hasDangerousPermission(skill) {
  return (skill.requiredPermissions ?? []).some((permission) => DANGEROUS_PERMISSIONS.has(permission));
}

function isValidSwarmDecision(decision) {
  return decision.mode === "SWARM" &&
    Array.isArray(decision.workerAgents) &&
    decision.workerAgents.length >= 2 &&
    typeof decision.rationale === "string" &&
    decision.rationale.length >= 12 &&
    decision.fallbackPlan?.mode &&
    Number.isFinite(decision.p99BudgetMs);
}

function summarizeDirectDatabaseWrite(skills) {
  if (skills.length === 0) return "no skills";
  return skills.map((skill) => `${skill.skillId}:${skill.directDatabaseWriteAllowed}`).join(";");
}

function summarizeDangerousHarness(skills) {
  if (skills.length === 0) return "no skills";
  return skills
    .filter(hasDangerousPermission)
    .map((skill) => `${skill.skillId}:harness=${skill.harnessRequired}:permissions=${skill.requiredPermissions.join("|")}`)
    .join(";") || "none";
}

function summarizeEvidencePolicy(skills) {
  if (skills.length === 0) return "no skills";
  return skills
    .map((skill) => `${skill.skillId}:required=${skill.evidencePolicy?.required}:trace=${skill.evidencePolicy?.traceRequired}:refs=${skill.evidencePolicy?.requiredEvidenceRefs?.length ?? 0}`)
    .join(";");
}

function summarizeTaskApproval(tasks) {
  if (tasks.length === 0) return "no tasks";
  return tasks.map((task) => `${task.taskId}:write=${task.writeIntent}:approval=${task.requiresHumanApproval}`).join(";");
}

function summarizeRouteDecisions(decisions) {
  if (decisions.length === 0) return "no decisions";
  return decisions
    .map((decision) => `${decision.routeId}:${decision.mode}:workers=${decision.workerAgents?.length ?? 0}:p99=${decision.p99BudgetMs}`)
    .join(";");
}

function summarizeGuardrailDirectDb(results) {
  if (results.length === 0) return "no results";
  return results.map((result) => `${result.guardrailId}:${result.directDatabaseWriteAllowed}`).join(";");
}

function summarizeGuardrailHarness(results) {
  if (results.length === 0) return "no results";
  return results.map((result) => `${result.guardrailId}:${result.decision}:harness=${result.harnessActionRequired}`).join(";");
}

function summarizeTeachingReadonlySchemaRefs(skill, inputSchema, outputSchema) {
  if (!skill) return "missing search_teaching_material";
  return [
    `inputRef=${skill.inputSchemaRef ?? "missing"}`,
    `outputRef=${skill.outputSchemaRef ?? "missing"}`,
    `inputVersion=${inputSchema.properties?.schemaVersion?.const ?? "missing"}`,
    `outputVersion=${outputSchema.properties?.schemaVersion?.const ?? "missing"}`,
  ].join(" ");
}

function summarizeTeachingReadonlyInputBoundary(schema) {
  return [
    `contextRef=${requiredFields(schema).includes("contextRef")}`,
    `p99Max=${schema.properties?.latencyBudgetMs?.maximum ?? "missing"}`,
    `writeIntent=${schema.properties?.writeIntent?.const ?? "missing"}`,
    `studentDataAccess=${schema.properties?.studentDataAccess?.const ?? "missing"}`,
    `externalModelAllowed=${schema.properties?.externalModelAllowed?.const ?? "missing"}`,
    `ownerType=${schema.properties?.filters?.properties?.ownerType?.const ?? "missing"}`,
    `includeStudentArchive=${schema.properties?.filters?.properties?.includeStudentArchive?.const ?? "missing"}`,
  ].join(" ");
}

function summarizeTeachingReadonlyOutputBoundary(schema) {
  return [
    `evidenceRefs=${requiredFields(schema).includes("evidenceRefs")}`,
    `ownerType=${schema.properties?.items?.items?.properties?.ownerType?.const ?? "missing"}`,
    `directDb=${schema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const ?? "missing"}`,
    `studentData=${schema.properties?.safety?.properties?.studentDataReturned?.const ?? "missing"}`,
    `externalModel=${schema.properties?.safety?.properties?.externalModelUsed?.const ?? "missing"}`,
    `p99Max=${schema.properties?.slo?.properties?.p99BudgetMs?.maximum ?? "missing"}`,
    `runtimeEvidenceRequired=${schema.properties?.slo?.properties?.runtimeEvidenceRequiredBeforePromotion?.const ?? "missing"}`,
  ].join(" ");
}

function summarizeTeachingReadonlyExamples(input, output) {
  return [
    `inputVersion=${input.schemaVersion ?? "missing"}`,
    `outputVersion=${output.schemaVersion ?? "missing"}`,
    `write=${input.writeIntent ?? "missing"}`,
    `owner=${input.filters?.ownerType ?? "missing"}`,
    `studentArchive=${input.filters?.includeStudentArchive ?? "missing"}`,
    `studentAccess=${input.studentDataAccess ?? "missing"}`,
    `externalModelAllowed=${input.externalModelAllowed ?? "missing"}`,
    `inputP99=${input.latencyBudgetMs ?? "missing"}`,
    `outputDirectDb=${output.safety?.directDatabaseWriteAllowed ?? "missing"}`,
    `outputStudentData=${output.safety?.studentDataReturned ?? "missing"}`,
    `outputExternalModel=${output.safety?.externalModelUsed ?? "missing"}`,
    `outputP99=${output.slo?.p99BudgetMs ?? "missing"}`,
    `evidenceRefs=${output.evidenceRefs?.length ?? 0}`,
  ].join(" ");
}

function summarizeTeachingReadonlyAdapterIdentity(schema, example) {
  return [
    `schemaVersion=${schema.properties?.schemaVersion?.const ?? "missing"}`,
    `adapterId=${example.adapterId ?? schema.properties?.adapterId?.const ?? "missing"}`,
    `worker=${example.workerAgent ?? schema.properties?.workerAgent?.const ?? "missing"}`,
    `skill=${example.skillId ?? schema.properties?.skillId?.const ?? "missing"}`,
    `route=${example.routeMode ?? schema.properties?.routeMode?.const ?? "missing"}`,
  ].join(" ");
}

function summarizeTeachingReadonlyAdapterReadPort(schema, example) {
  return [
    `port=${example.readPort?.portName ?? schema.properties?.readPort?.properties?.portName?.const ?? "missing"}`,
    `operation=${example.readPort?.operation ?? schema.properties?.readPort?.properties?.operation?.const ?? "missing"}`,
    `directDb=${example.readPort?.directDatabaseAccessAllowed ?? schema.properties?.readPort?.properties?.directDatabaseAccessAllowed?.const ?? "missing"}`,
    `write=${example.readPort?.writeOperationAllowed ?? schema.properties?.readPort?.properties?.writeOperationAllowed?.const ?? "missing"}`,
  ].join(" ");
}

function summarizeTeachingReadonlyAdapterGuards(schema, example) {
  const schemaScopes = schema.properties?.guards?.properties?.dataScopes?.properties ?? {};
  const exampleScopes = example.guards?.dataScopes ?? {};
  return [
    `principal=${example.guards?.principalContextRequired ?? schema.properties?.guards?.properties?.principalContextRequired?.const ?? "missing"}`,
    `shared=${example.guards?.sharedContextRequired ?? schema.properties?.guards?.properties?.sharedContextRequired?.const ?? "missing"}`,
    `guardrail=${example.guards?.guardrailResultRequired ?? schema.properties?.guards?.properties?.guardrailResultRequired?.const ?? "missing"}`,
    `denyWrite=${example.guards?.denyOnWriteIntent ?? schema.properties?.guards?.properties?.denyOnWriteIntent?.const ?? "missing"}`,
    `denyStudentArchive=${example.guards?.denyOnStudentArchiveRequest ?? schema.properties?.guards?.properties?.denyOnStudentArchiveRequest?.const ?? "missing"}`,
    `denyExternalModel=${example.guards?.denyOnExternalModelRequest ?? schema.properties?.guards?.properties?.denyOnExternalModelRequest?.const ?? "missing"}`,
    `scopes=${exampleScopes.knowledge ?? schemaScopes.knowledge?.const}/${exampleScopes.student ?? schemaScopes.student?.const}/${exampleScopes.teaching ?? schemaScopes.teaching?.const}/${exampleScopes.research ?? schemaScopes.research?.const}/${exampleScopes.localTool ?? schemaScopes.localTool?.const}`,
  ].join(" ");
}

function summarizeTeachingReadonlyAdapterEvidence(schema, example) {
  return [
    `trace=${example.evidence?.skillInvocationTraceRequired ?? schema.properties?.evidence?.properties?.skillInvocationTraceRequired?.const ?? "missing"}`,
    `inputHash=${example.evidence?.inputHashRequired ?? schema.properties?.evidence?.properties?.inputHashRequired?.const ?? "missing"}`,
    `outputSummary=${example.evidence?.outputSummaryRequired ?? schema.properties?.evidence?.properties?.outputSummaryRequired?.const ?? "missing"}`,
    `sourceRefs=${example.evidence?.sourceEvidenceRefsRequired ?? schema.properties?.evidence?.properties?.sourceEvidenceRefsRequired?.const ?? "missing"}`,
    `timing=${example.evidence?.runtimeTimingRequired ?? schema.properties?.evidence?.properties?.runtimeTimingRequired?.const ?? "missing"}`,
    `p99=${example.slo?.p99BudgetMs ?? schema.properties?.slo?.properties?.p99BudgetMs?.maximum ?? "missing"}`,
    `promotion=${example.promotion?.runtimeEvidenceRequiredBeforePromotion ?? schema.properties?.promotion?.properties?.runtimeEvidenceRequiredBeforePromotion?.const ?? "missing"}`,
  ].join(" ");
}

function adapterDataScopesMatch(scopes = {}) {
  return scopes.knowledge?.const === "PUBLIC" &&
    scopes.student?.const === "NONE" &&
    scopes.teaching?.const === "READ" &&
    scopes.research?.const === "NONE" &&
    scopes.localTool?.const === "NONE";
}

function exampleDataScopesMatch(scopes = {}) {
  return scopes.knowledge === "PUBLIC" &&
    scopes.student === "NONE" &&
    scopes.teaching === "READ" &&
    scopes.research === "NONE" &&
    scopes.localTool === "NONE";
}

function adapterEvidenceSchemaReady(evidence = {}) {
  return evidence.skillInvocationTraceRequired?.const === true &&
    evidence.inputHashRequired?.const === true &&
    evidence.outputSummaryRequired?.const === true &&
    evidence.sourceEvidenceRefsRequired?.const === true &&
    evidence.runtimeTimingRequired?.const === true;
}

function adapterEvidenceExampleReady(evidence = {}) {
  return evidence.skillInvocationTraceRequired === true &&
    evidence.inputHashRequired === true &&
    evidence.outputSummaryRequired === true &&
    evidence.sourceEvidenceRefsRequired === true &&
    evidence.runtimeTimingRequired === true;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.join(",");
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
    const report = auditAgentSkillContracts(loadCurrentInputs(process.cwd()));
    if (args.outPath) {
      fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
      fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(formatAgentSkillContractAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
