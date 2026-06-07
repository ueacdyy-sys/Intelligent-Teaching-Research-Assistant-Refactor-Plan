import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/research-agent-readonly-contract.current.json";
const contractFiles = {
  skillExamples: "contracts/agent/skill-manifest.examples.json",
  inputSchema: "contracts/agent/skills/search-knowledge.input.schema.json",
  outputSchema: "contracts/agent/skills/search-knowledge.output.schema.json",
  inputExample: "contracts/agent/skills/search-knowledge.input.example.json",
  outputExample: "contracts/agent/skills/search-knowledge.output.example.json",
  adapterSchema: "contracts/agent/research-agent-readonly-adapter.schema.json",
  adapterExample: "contracts/agent/research-agent-readonly-adapter.example.json",
};

export function auditResearchAgentReadonlyContracts(inputs) {
  const findings = [];
  const skills = Array.isArray(inputs.skillExamples?.skills) ? inputs.skillExamples.skills : [];
  const skill = skills.find((candidate) => candidate.skillId === "search_knowledge");
  const inputSchema = inputs.inputSchema ?? {};
  const outputSchema = inputs.outputSchema ?? {};
  const inputExample = inputs.inputExample ?? {};
  const outputExample = inputs.outputExample ?? {};
  const adapterSchema = inputs.adapterSchema ?? {};
  const adapterExample = inputs.adapterExample ?? {};

  addFinding(findings, {
    id: "research_readonly_skill.manifest",
    passed: skill?.domain === "Research" &&
      skill?.inputSchemaRef === contractFiles.inputSchema &&
      skill?.outputSchemaRef === contractFiles.outputSchema &&
      skill?.latencyBudgetMs <= 50 &&
      skill?.directDatabaseWriteAllowed === false &&
      skill?.harnessRequired === false &&
      skill?.allowedWorkerAgents?.includes("ResearchAgent") &&
      skill?.dataScopes?.knowledge === "PRIVATE_ASSIGNED" &&
      skill?.dataScopes?.student === "NONE" &&
      skill?.dataScopes?.research === "READ" &&
      skill?.dataScopes?.localTool === "NONE",
    actual: summarizeSkill(skill),
    expected: "ResearchAgent search_knowledge read-only manifest, p99<=50, private-assigned knowledge only",
    remediation: "ResearchAgent needs a low-latency read-only search_knowledge Skill before deep_research runtime work.",
  });

  addFinding(findings, {
    id: "research_readonly_skill.input_boundary",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-04.agent.skill.search-knowledge.input.v1" &&
      requiredFields(inputSchema).includes("contextRef") &&
      inputSchema.properties?.latencyBudgetMs?.maximum === 50 &&
      inputSchema.properties?.writeIntent?.const === false &&
      inputSchema.properties?.studentDataAccess?.const === "NONE" &&
      inputSchema.properties?.externalModelAllowed?.const === false &&
      inputSchema.properties?.synthesisAllowed?.const === false &&
      inputSchema.properties?.filters?.properties?.includeStudentArchive?.const === false &&
      !enumValues(inputSchema.properties?.filters?.properties?.allowedClassifications?.items).includes("STUDENT_ARCHIVE"),
    actual: summarizeInputSchema(inputSchema),
    expected: "contextRef required, p99<=50, no write, no student archive, no external model, no synthesis",
    remediation: "ResearchAgent fast-path input must stay retrieval-only and cannot request student archives or model synthesis.",
  });

  addFinding(findings, {
    id: "research_readonly_skill.output_boundary",
    passed: outputSchema.properties?.schemaVersion?.const === "2026-06-04.agent.skill.search-knowledge.output.v1" &&
      requiredFields(outputSchema).includes("evidenceRefs") &&
      !enumValues(outputSchema.properties?.items?.items?.properties?.classification).includes("STUDENT_ARCHIVE") &&
      outputSchema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const === false &&
      outputSchema.properties?.safety?.properties?.studentArchiveReturned?.const === false &&
      outputSchema.properties?.safety?.properties?.studentDataReturned?.const === false &&
      outputSchema.properties?.safety?.properties?.returnedWithinPolicy?.const === true &&
      outputSchema.properties?.safety?.properties?.externalModelUsed?.const === false &&
      outputSchema.properties?.safety?.properties?.localToolMutationAllowed?.const === false &&
      outputSchema.properties?.slo?.properties?.p99BudgetMs?.maximum === 50 &&
      outputSchema.properties?.slo?.properties?.runtimeEvidenceRequiredBeforePromotion?.const === true,
    actual: summarizeOutputSchema(outputSchema),
    expected: "policy-safe cited knowledge output, no student archive, no model, p99<=50, runtime evidence required",
    remediation: "ResearchAgent fast-path output must not return student archive data or bypass SLO promotion evidence.",
  });

  addFinding(findings, {
    id: "research_readonly_skill.examples_safe_fast_path",
    passed: inputExample.schemaVersion === inputSchema.properties?.schemaVersion?.const &&
      outputExample.schemaVersion === outputSchema.properties?.schemaVersion?.const &&
      inputExample.writeIntent === false &&
      inputExample.filters?.includeStudentArchive === false &&
      inputExample.studentDataAccess === "NONE" &&
      inputExample.externalModelAllowed === false &&
      inputExample.synthesisAllowed === false &&
      inputExample.latencyBudgetMs <= 50 &&
      outputExample.safety?.directDatabaseWriteAllowed === false &&
      outputExample.safety?.studentArchiveReturned === false &&
      outputExample.safety?.studentDataReturned === false &&
      outputExample.safety?.returnedWithinPolicy === true &&
      outputExample.safety?.externalModelUsed === false &&
      outputExample.safety?.localToolMutationAllowed === false &&
      outputExample.slo?.p99BudgetMs <= 50 &&
      outputExample.slo?.runtimeEvidenceRequiredBeforePromotion === true &&
      Array.isArray(outputExample.evidenceRefs) &&
      outputExample.evidenceRefs.length > 0,
    actual: summarizeExamples(inputExample, outputExample),
    expected: "examples are read-only, cited, policy-safe, no model, and <=50ms",
    remediation: "ResearchAgent examples must prove the safe retrieval path before runtime adapter promotion.",
  });

  addFinding(findings, {
    id: "research_readonly_adapter.identity_and_port",
    passed: adapterSchema.properties?.schemaVersion?.const === "2026-06-04.agent.research-readonly-adapter.v1" &&
      adapterSchema.properties?.adapterId?.const === "research_agent_search_knowledge_readonly_adapter" &&
      adapterSchema.properties?.workerAgent?.const === "ResearchAgent" &&
      adapterSchema.properties?.skillId?.const === "search_knowledge" &&
      adapterSchema.properties?.routeMode?.const === "SINGLE_WORKER" &&
      adapterSchema.properties?.readPort?.properties?.portName?.const === "KnowledgeQueryReadPort" &&
      adapterSchema.properties?.readPort?.properties?.operation?.const === "searchKnowledge" &&
      adapterSchema.properties?.readPort?.properties?.directDatabaseAccessAllowed?.const === false &&
      adapterSchema.properties?.readPort?.properties?.writeOperationAllowed?.const === false &&
      adapterExample.adapterId === "research_agent_search_knowledge_readonly_adapter" &&
      adapterExample.workerAgent === "ResearchAgent" &&
      adapterExample.skillId === "search_knowledge" &&
      adapterExample.readPort?.portName === "KnowledgeQueryReadPort" &&
      adapterExample.readPort?.operation === "searchKnowledge" &&
      adapterExample.readPort?.directDatabaseAccessAllowed === false &&
      adapterExample.readPort?.writeOperationAllowed === false,
    actual: summarizeAdapterIdentity(adapterSchema, adapterExample),
    expected: "ResearchAgent SINGLE_WORKER adapter bound to KnowledgeQueryReadPort.searchKnowledge",
    remediation: "ResearchAgent read-only adapter must call the knowledge read port instead of direct database or write adapters.",
  });

  addFinding(findings, {
    id: "research_readonly_adapter.guards_evidence_slo",
    passed: adapterGuardsReady(adapterSchema.properties?.guards?.properties, adapterExample.guards) &&
      adapterEvidenceReady(adapterSchema.properties?.evidence?.properties, adapterExample.evidence) &&
      adapterSchema.properties?.slo?.properties?.p99BudgetMs?.maximum === 50 &&
      adapterExample.slo?.p99BudgetMs <= 50 &&
      adapterSchema.properties?.promotion?.properties?.runtimeEvidenceRequiredBeforePromotion?.const === true &&
      adapterExample.promotion?.runtimeEvidenceRequiredBeforePromotion === true &&
      adapterSchema.properties?.promotion?.properties?.rootWorkflowRequired?.const === true &&
      adapterExample.promotion?.rootWorkflowRequired === true,
    actual: summarizeAdapterGuards(adapterSchema, adapterExample),
    expected: "guards/evidence/SLO/root-workflow promotion all required",
    remediation: "ResearchAgent read-only adapter must keep privacy guards, timing evidence, and root workflow promotion gates.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: new Date().toISOString(),
    readiness,
    workloadType: "RESEARCH_AGENT_READONLY_CONTRACT_AUDIT",
    summary: {
      researchReadOnlySkill: skill ? {
        skillId: skill.skillId,
        workerAgent: "ResearchAgent",
        schemaRefsReady: findingPassed(findings, "research_readonly_skill.manifest"),
        inputBoundaryReady: findingPassed(findings, "research_readonly_skill.input_boundary"),
        outputBoundaryReady: findingPassed(findings, "research_readonly_skill.output_boundary"),
      } : null,
      researchReadOnlyAdapter: adapterExample.adapterId ? {
        adapterId: adapterExample.adapterId,
        readPortReady: findingPassed(findings, "research_readonly_adapter.identity_and_port"),
        guardsReady: findingPassed(findings, "research_readonly_adapter.guards_evidence_slo"),
        evidenceSloReady: findingPassed(findings, "research_readonly_adapter.guards_evidence_slo"),
      } : null,
    },
    findings,
  };
}

export function formatResearchAgentReadonlyContractAudit(report) {
  const lines = [
    `ResearchAgent read-only contracts: ${report.readiness}`,
    `Research read-only skill: ${report.summary.researchReadOnlySkill?.skillId ?? "missing"}`,
    `Research read-only adapter: ${report.summary.researchReadOnlyAdapter?.adapterId ?? "missing"}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  return lines.join("\n");
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

function enumValues(schema) {
  return Array.isArray(schema?.enum) ? schema.enum : [];
}

function findingPassed(findings, id) {
  return findings.find((finding) => finding.id === id)?.passed === true;
}

function summarizeSkill(skill) {
  if (!skill) return "missing search_knowledge";
  return `skill=${skill.skillId};worker=${skill.allowedWorkerAgents?.join("|")};p99=${skill.latencyBudgetMs};scopes=${skill.dataScopes?.knowledge}/${skill.dataScopes?.student}/${skill.dataScopes?.research}/${skill.dataScopes?.localTool};directDb=${skill.directDatabaseWriteAllowed};harness=${skill.harnessRequired}`;
}

function summarizeInputSchema(schema) {
  return `version=${schema.properties?.schemaVersion?.const};p99=${schema.properties?.latencyBudgetMs?.maximum};write=${schema.properties?.writeIntent?.const};student=${schema.properties?.studentDataAccess?.const};externalModel=${schema.properties?.externalModelAllowed?.const};synthesis=${schema.properties?.synthesisAllowed?.const};studentArchive=${schema.properties?.filters?.properties?.includeStudentArchive?.const};classes=${enumValues(schema.properties?.filters?.properties?.allowedClassifications?.items).join("|")}`;
}

function summarizeOutputSchema(schema) {
  return `version=${schema.properties?.schemaVersion?.const};classes=${enumValues(schema.properties?.items?.items?.properties?.classification).join("|")};directDb=${schema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const};studentArchive=${schema.properties?.safety?.properties?.studentArchiveReturned?.const};studentData=${schema.properties?.safety?.properties?.studentDataReturned?.const};withinPolicy=${schema.properties?.safety?.properties?.returnedWithinPolicy?.const};externalModel=${schema.properties?.safety?.properties?.externalModelUsed?.const};localTool=${schema.properties?.safety?.properties?.localToolMutationAllowed?.const};p99=${schema.properties?.slo?.properties?.p99BudgetMs?.maximum}`;
}

function summarizeExamples(input, output) {
  return `inputVersion=${input.schemaVersion};write=${input.writeIntent};studentArchive=${input.filters?.includeStudentArchive};studentAccess=${input.studentDataAccess};externalModel=${input.externalModelAllowed};synthesis=${input.synthesisAllowed};inputP99=${input.latencyBudgetMs};outputVersion=${output.schemaVersion};outputP99=${output.slo?.p99BudgetMs};evidenceRefs=${output.evidenceRefs?.length ?? 0}`;
}

function summarizeAdapterIdentity(schema, example) {
  return `schemaVersion=${schema.properties?.schemaVersion?.const};adapter=${example.adapterId ?? schema.properties?.adapterId?.const};worker=${example.workerAgent ?? schema.properties?.workerAgent?.const};skill=${example.skillId ?? schema.properties?.skillId?.const};port=${example.readPort?.portName ?? schema.properties?.readPort?.properties?.portName?.const};operation=${example.readPort?.operation ?? schema.properties?.readPort?.properties?.operation?.const};directDb=${example.readPort?.directDatabaseAccessAllowed};write=${example.readPort?.writeOperationAllowed}`;
}

function summarizeAdapterGuards(schema, example) {
  const scopes = example.guards?.dataScopes ?? {};
  return `denyWrite=${example.guards?.denyOnWriteIntent};denyStudentArchive=${example.guards?.denyOnStudentArchiveRequest};denyExternalModel=${example.guards?.denyOnExternalModelRequest};denyTool=${example.guards?.denyOnLocalToolMutation};scopes=${scopes.knowledge}/${scopes.student}/${scopes.teaching}/${scopes.research}/${scopes.localTool};timing=${example.evidence?.runtimeTimingRequired};p99=${example.slo?.p99BudgetMs};promotion=${example.promotion?.runtimeEvidenceRequiredBeforePromotion};root=${example.promotion?.rootWorkflowRequired};schemaGuards=${Object.keys(schema.properties?.guards?.properties ?? {}).length}`;
}

function adapterGuardsReady(schemaGuards = {}, exampleGuards = {}) {
  const schemaScopes = schemaGuards.dataScopes?.properties ?? {};
  const exampleScopes = exampleGuards.dataScopes ?? {};
  return schemaGuards.principalContextRequired?.const === true &&
    schemaGuards.sharedContextRequired?.const === true &&
    schemaGuards.guardrailResultRequired?.const === true &&
    schemaGuards.denyOnWriteIntent?.const === true &&
    schemaGuards.denyOnStudentArchiveRequest?.const === true &&
    schemaGuards.denyOnExternalModelRequest?.const === true &&
    schemaGuards.denyOnLocalToolMutation?.const === true &&
    schemaScopes.knowledge?.const === "PRIVATE_ASSIGNED" &&
    schemaScopes.student?.const === "NONE" &&
    schemaScopes.teaching?.const === "NONE" &&
    schemaScopes.research?.const === "READ" &&
    schemaScopes.localTool?.const === "NONE" &&
    exampleGuards.principalContextRequired === true &&
    exampleGuards.sharedContextRequired === true &&
    exampleGuards.guardrailResultRequired === true &&
    exampleGuards.denyOnWriteIntent === true &&
    exampleGuards.denyOnStudentArchiveRequest === true &&
    exampleGuards.denyOnExternalModelRequest === true &&
    exampleGuards.denyOnLocalToolMutation === true &&
    exampleScopes.knowledge === "PRIVATE_ASSIGNED" &&
    exampleScopes.student === "NONE" &&
    exampleScopes.teaching === "NONE" &&
    exampleScopes.research === "READ" &&
    exampleScopes.localTool === "NONE";
}

function adapterEvidenceReady(schemaEvidence = {}, exampleEvidence = {}) {
  return schemaEvidence.skillInvocationTraceRequired?.const === true &&
    schemaEvidence.inputHashRequired?.const === true &&
    schemaEvidence.outputSummaryRequired?.const === true &&
    schemaEvidence.sourceEvidenceRefsRequired?.const === true &&
    schemaEvidence.runtimeTimingRequired?.const === true &&
    exampleEvidence.skillInvocationTraceRequired === true &&
    exampleEvidence.inputHashRequired === true &&
    exampleEvidence.outputSummaryRequired === true &&
    exampleEvidence.sourceEvidenceRefsRequired === true &&
    exampleEvidence.runtimeTimingRequired === true;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

function loadInputs(root) {
  return Object.fromEntries(Object.entries(contractFiles).map(([key, relativePath]) => [
    key,
    JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8")),
  ]));
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditResearchAgentReadonlyContracts(loadInputs(process.cwd()));
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatResearchAgentReadonlyContractAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
