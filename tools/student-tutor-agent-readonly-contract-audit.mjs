import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-tutor-agent-readonly-contract.current.json";
const contractFiles = {
  skillExamples: "contracts/agent/skill-manifest.examples.json",
  inputSchema: "contracts/agent/skills/recommend-practice.input.schema.json",
  outputSchema: "contracts/agent/skills/recommend-practice.output.schema.json",
  inputExample: "contracts/agent/skills/recommend-practice.input.example.json",
  outputExample: "contracts/agent/skills/recommend-practice.output.example.json",
  adapterSchema: "contracts/agent/student-tutor-agent-readonly-adapter.schema.json",
  adapterExample: "contracts/agent/student-tutor-agent-readonly-adapter.example.json",
};

export function auditStudentTutorAgentReadonlyContracts(inputs) {
  const findings = [];
  const skills = Array.isArray(inputs.skillExamples?.skills) ? inputs.skillExamples.skills : [];
  const skill = skills.find((candidate) => candidate.skillId === "recommend_practice");
  const inputSchema = inputs.inputSchema ?? {};
  const outputSchema = inputs.outputSchema ?? {};
  const inputExample = inputs.inputExample ?? {};
  const outputExample = inputs.outputExample ?? {};
  const adapterSchema = inputs.adapterSchema ?? {};
  const adapterExample = inputs.adapterExample ?? {};

  addFinding(findings, {
    id: "student_tutor_readonly_skill.manifest",
    passed: skill?.domain === "StudentTutor" &&
      skill?.inputSchemaRef === contractFiles.inputSchema &&
      skill?.outputSchemaRef === contractFiles.outputSchema &&
      skill?.latencyBudgetMs <= 50 &&
      skill?.directDatabaseWriteAllowed === false &&
      skill?.harnessRequired === false &&
      skill?.allowedWorkerAgents?.includes("StudentTutorAgent") &&
      skill?.requiredPermissions?.includes("STUDENT_OWN_READ") &&
      skill?.requiredPermissions?.includes("STUDENT_ASSIGNED_READ") &&
      skill?.requiredPermissions?.includes("TEACHING_READ") &&
      skill?.dataScopes?.knowledge === "PUBLIC" &&
      skill?.dataScopes?.student === "ASSIGNED" &&
      skill?.dataScopes?.teaching === "READ" &&
      skill?.dataScopes?.research === "NONE" &&
      skill?.dataScopes?.localTool === "NONE",
    actual: summarizeSkill(skill),
    expected: "StudentTutorAgent recommend_practice read-only manifest, p99<=50, own/assigned student scope",
    remediation: "StudentTutorAgent needs a low-latency read-only recommend_practice Skill before AI tutor runtime work.",
  });

  addFinding(findings, {
    id: "student_tutor_readonly_skill.input_boundary",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-04.agent.skill.recommend-practice.input.v1" &&
      requiredFields(inputSchema).includes("contextRef") &&
      inputSchema.properties?.latencyBudgetMs?.maximum === 50 &&
      inputSchema.properties?.writeIntent?.const === false &&
      inputSchema.properties?.studentDataAccess?.const === "OWN_OR_ASSIGNED" &&
      inputSchema.properties?.externalModelAllowed?.const === false &&
      inputSchema.properties?.finalEvaluationAllowed?.const === false &&
      inputSchema.properties?.targetStudentScope?.properties?.crossStudentComparisonAllowed?.const === false &&
      inputSchema.properties?.filters?.properties?.includeOtherStudents?.const === false,
    actual: summarizeInputSchema(inputSchema),
    expected: "contextRef required, p99<=50, no write, own/assigned only, no cross-student, no external model",
    remediation: "StudentTutorAgent fast-path input must stay scoped to own/assigned learning signals.",
  });

  addFinding(findings, {
    id: "student_tutor_readonly_skill.output_boundary",
    passed: outputSchema.properties?.schemaVersion?.const === "2026-06-04.agent.skill.recommend-practice.output.v1" &&
      requiredFields(outputSchema).includes("evidenceRefs") &&
      outputSchema.properties?.safety?.properties?.directDatabaseWriteAllowed?.const === false &&
      outputSchema.properties?.safety?.properties?.crossStudentDataReturned?.const === false &&
      outputSchema.properties?.safety?.properties?.rawStudentArchiveReturned?.const === false &&
      outputSchema.properties?.safety?.properties?.finalEvaluationReturned?.const === false &&
      outputSchema.properties?.safety?.properties?.externalModelUsed?.const === false &&
      outputSchema.properties?.safety?.properties?.localToolMutationAllowed?.const === false &&
      outputSchema.properties?.safety?.properties?.returnedWithinStudentScope?.const === true &&
      outputSchema.properties?.slo?.properties?.p99BudgetMs?.maximum === 50 &&
      outputSchema.properties?.slo?.properties?.runtimeEvidenceRequiredBeforePromotion?.const === true,
    actual: summarizeOutputSchema(outputSchema),
    expected: "practice recommendations only, no raw archive, no cross-student data, no final evaluation, p99<=50",
    remediation: "StudentTutorAgent output must not leak raw student archive data or final evaluations.",
  });

  addFinding(findings, {
    id: "student_tutor_readonly_skill.examples_safe_fast_path",
    passed: inputExample.schemaVersion === inputSchema.properties?.schemaVersion?.const &&
      outputExample.schemaVersion === outputSchema.properties?.schemaVersion?.const &&
      inputExample.writeIntent === false &&
      inputExample.targetStudentScope?.crossStudentComparisonAllowed === false &&
      inputExample.filters?.includeOtherStudents === false &&
      inputExample.studentDataAccess === "OWN_OR_ASSIGNED" &&
      inputExample.externalModelAllowed === false &&
      inputExample.finalEvaluationAllowed === false &&
      inputExample.latencyBudgetMs <= 50 &&
      outputExample.safety?.directDatabaseWriteAllowed === false &&
      outputExample.safety?.crossStudentDataReturned === false &&
      outputExample.safety?.rawStudentArchiveReturned === false &&
      outputExample.safety?.finalEvaluationReturned === false &&
      outputExample.safety?.externalModelUsed === false &&
      outputExample.safety?.localToolMutationAllowed === false &&
      outputExample.safety?.returnedWithinStudentScope === true &&
      outputExample.slo?.p99BudgetMs <= 50 &&
      outputExample.slo?.runtimeEvidenceRequiredBeforePromotion === true &&
      Array.isArray(outputExample.evidenceRefs) &&
      outputExample.evidenceRefs.length > 0,
    actual: summarizeExamples(inputExample, outputExample),
    expected: "examples are read-only, scoped, evidence-backed, no model, and <=50ms",
    remediation: "StudentTutorAgent examples must prove safe scoped recommendations before runtime adapter promotion.",
  });

  addFinding(findings, {
    id: "student_tutor_readonly_adapter.identity_and_port",
    passed: adapterSchema.properties?.schemaVersion?.const === "2026-06-04.agent.student-tutor-readonly-adapter.v1" &&
      adapterSchema.properties?.adapterId?.const === "student_tutor_recommend_practice_readonly_adapter" &&
      adapterSchema.properties?.workerAgent?.const === "StudentTutorAgent" &&
      adapterSchema.properties?.skillId?.const === "recommend_practice" &&
      adapterSchema.properties?.routeMode?.const === "SINGLE_WORKER" &&
      adapterSchema.properties?.readPort?.properties?.portName?.const === "StudentLearningReadPort" &&
      adapterSchema.properties?.readPort?.properties?.operation?.const === "recommendPracticeContext" &&
      adapterSchema.properties?.readPort?.properties?.directDatabaseAccessAllowed?.const === false &&
      adapterSchema.properties?.readPort?.properties?.writeOperationAllowed?.const === false &&
      adapterExample.adapterId === "student_tutor_recommend_practice_readonly_adapter" &&
      adapterExample.workerAgent === "StudentTutorAgent" &&
      adapterExample.skillId === "recommend_practice" &&
      adapterExample.readPort?.portName === "StudentLearningReadPort" &&
      adapterExample.readPort?.operation === "recommendPracticeContext" &&
      adapterExample.readPort?.directDatabaseAccessAllowed === false &&
      adapterExample.readPort?.writeOperationAllowed === false,
    actual: summarizeAdapterIdentity(adapterSchema, adapterExample),
    expected: "StudentTutorAgent SINGLE_WORKER adapter bound to StudentLearningReadPort.recommendPracticeContext",
    remediation: "StudentTutorAgent read-only adapter must call a read port instead of direct database or write adapters.",
  });

  addFinding(findings, {
    id: "student_tutor_readonly_adapter.guards_evidence_slo",
    passed: adapterGuardsReady(adapterSchema.properties?.guards?.properties, adapterExample.guards) &&
      adapterEvidenceReady(adapterSchema.properties?.evidence?.properties, adapterExample.evidence) &&
      adapterSchema.properties?.slo?.properties?.p99BudgetMs?.maximum === 50 &&
      adapterExample.slo?.p99BudgetMs <= 50 &&
      adapterSchema.properties?.promotion?.properties?.runtimeEvidenceRequiredBeforePromotion?.const === true &&
      adapterExample.promotion?.runtimeEvidenceRequiredBeforePromotion === true &&
      adapterSchema.properties?.promotion?.properties?.rootWorkflowRequired?.const === true &&
      adapterExample.promotion?.rootWorkflowRequired === true,
    actual: summarizeAdapterGuards(adapterSchema, adapterExample),
    expected: "guards/evidence/student-scope/SLO/root-workflow promotion all required",
    remediation: "StudentTutorAgent read-only adapter must keep privacy guards, student-scope evidence, and timing gates.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_TUTOR_AGENT_READONLY_CONTRACT_AUDIT",
    summary: {
      studentTutorReadOnlySkill: skill ? {
        skillId: skill.skillId,
        workerAgent: "StudentTutorAgent",
        schemaRefsReady: findingPassed(findings, "student_tutor_readonly_skill.manifest"),
        inputBoundaryReady: findingPassed(findings, "student_tutor_readonly_skill.input_boundary"),
        outputBoundaryReady: findingPassed(findings, "student_tutor_readonly_skill.output_boundary"),
      } : null,
      studentTutorReadOnlyAdapter: adapterExample.adapterId ? {
        adapterId: adapterExample.adapterId,
        readPortReady: findingPassed(findings, "student_tutor_readonly_adapter.identity_and_port"),
        guardsReady: findingPassed(findings, "student_tutor_readonly_adapter.guards_evidence_slo"),
        evidenceSloReady: findingPassed(findings, "student_tutor_readonly_adapter.guards_evidence_slo"),
      } : null,
    },
    findings,
  };
}

export function formatStudentTutorAgentReadonlyContractAudit(report) {
  const lines = [
    `StudentTutorAgent read-only contracts: ${report.readiness}`,
    `StudentTutor read-only skill: ${report.summary.studentTutorReadOnlySkill?.skillId ?? "missing"}`,
    `StudentTutor read-only adapter: ${report.summary.studentTutorReadOnlyAdapter?.adapterId ?? "missing"}`,
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

function findingPassed(findings, id) {
  return findings.find((finding) => finding.id === id)?.passed === true;
}

function summarizeSkill(skill) {
  if (!skill) return "missing recommend_practice";
  return `skill=${skill.skillId};worker=${skill.allowedWorkerAgents?.join("|")};p99=${skill.latencyBudgetMs};scopes=${skill.dataScopes?.knowledge}/${skill.dataScopes?.student}/${skill.dataScopes?.teaching}/${skill.dataScopes?.research}/${skill.dataScopes?.localTool};perms=${skill.requiredPermissions?.join("|")};directDb=${skill.directDatabaseWriteAllowed};harness=${skill.harnessRequired}`;
}

function summarizeInputSchema(schema) {
  return `version=${schema.properties?.schemaVersion?.const};p99=${schema.properties?.latencyBudgetMs?.maximum};write=${schema.properties?.writeIntent?.const};student=${schema.properties?.studentDataAccess?.const};externalModel=${schema.properties?.externalModelAllowed?.const};finalEval=${schema.properties?.finalEvaluationAllowed?.const};crossStudent=${schema.properties?.targetStudentScope?.properties?.crossStudentComparisonAllowed?.const};includeOther=${schema.properties?.filters?.properties?.includeOtherStudents?.const}`;
}

function summarizeOutputSchema(schema) {
  const safety = schema.properties?.safety?.properties ?? {};
  return `version=${schema.properties?.schemaVersion?.const};directDb=${safety.directDatabaseWriteAllowed?.const};crossStudent=${safety.crossStudentDataReturned?.const};rawArchive=${safety.rawStudentArchiveReturned?.const};finalEval=${safety.finalEvaluationReturned?.const};externalModel=${safety.externalModelUsed?.const};localTool=${safety.localToolMutationAllowed?.const};withinScope=${safety.returnedWithinStudentScope?.const};p99=${schema.properties?.slo?.properties?.p99BudgetMs?.maximum}`;
}

function summarizeExamples(input, output) {
  return `inputVersion=${input.schemaVersion};write=${input.writeIntent};crossStudent=${input.targetStudentScope?.crossStudentComparisonAllowed};includeOther=${input.filters?.includeOtherStudents};studentAccess=${input.studentDataAccess};externalModel=${input.externalModelAllowed};finalEval=${input.finalEvaluationAllowed};inputP99=${input.latencyBudgetMs};outputVersion=${output.schemaVersion};outputP99=${output.slo?.p99BudgetMs};evidenceRefs=${output.evidenceRefs?.length ?? 0}`;
}

function summarizeAdapterIdentity(schema, example) {
  return `schemaVersion=${schema.properties?.schemaVersion?.const};adapter=${example.adapterId ?? schema.properties?.adapterId?.const};worker=${example.workerAgent ?? schema.properties?.workerAgent?.const};skill=${example.skillId ?? schema.properties?.skillId?.const};port=${example.readPort?.portName ?? schema.properties?.readPort?.properties?.portName?.const};operation=${example.readPort?.operation ?? schema.properties?.readPort?.properties?.operation?.const};directDb=${example.readPort?.directDatabaseAccessAllowed};write=${example.readPort?.writeOperationAllowed}`;
}

function summarizeAdapterGuards(schema, example) {
  const scopes = example.guards?.dataScopes ?? {};
  return `denyWrite=${example.guards?.denyOnWriteIntent};denyCross=${example.guards?.denyOnCrossStudentAccess};denyRaw=${example.guards?.denyOnRawStudentArchiveReturn};denyFinal=${example.guards?.denyOnFinalEvaluation};denyModel=${example.guards?.denyOnExternalModelRequest};denyTool=${example.guards?.denyOnLocalToolMutation};scopes=${scopes.knowledge}/${scopes.student}/${scopes.teaching}/${scopes.research}/${scopes.localTool};studentScopeEvidence=${example.evidence?.studentScopeEvidenceRequired};timing=${example.evidence?.runtimeTimingRequired};p99=${example.slo?.p99BudgetMs};promotion=${example.promotion?.runtimeEvidenceRequiredBeforePromotion};schemaGuards=${Object.keys(schema ?? {}).length}`;
}

function adapterGuardsReady(schemaGuards = {}, exampleGuards = {}) {
  const schemaScopes = schemaGuards.dataScopes?.properties ?? {};
  const exampleScopes = exampleGuards.dataScopes ?? {};
  return schemaGuards.principalContextRequired?.const === true &&
    schemaGuards.sharedContextRequired?.const === true &&
    schemaGuards.guardrailResultRequired?.const === true &&
    schemaGuards.denyOnWriteIntent?.const === true &&
    schemaGuards.denyOnCrossStudentAccess?.const === true &&
    schemaGuards.denyOnRawStudentArchiveReturn?.const === true &&
    schemaGuards.denyOnFinalEvaluation?.const === true &&
    schemaGuards.denyOnExternalModelRequest?.const === true &&
    schemaGuards.denyOnLocalToolMutation?.const === true &&
    schemaScopes.knowledge?.const === "PUBLIC" &&
    schemaScopes.student?.const === "ASSIGNED" &&
    schemaScopes.teaching?.const === "READ" &&
    schemaScopes.research?.const === "NONE" &&
    schemaScopes.localTool?.const === "NONE" &&
    exampleGuards.principalContextRequired === true &&
    exampleGuards.sharedContextRequired === true &&
    exampleGuards.guardrailResultRequired === true &&
    exampleGuards.denyOnWriteIntent === true &&
    exampleGuards.denyOnCrossStudentAccess === true &&
    exampleGuards.denyOnRawStudentArchiveReturn === true &&
    exampleGuards.denyOnFinalEvaluation === true &&
    exampleGuards.denyOnExternalModelRequest === true &&
    exampleGuards.denyOnLocalToolMutation === true &&
    exampleScopes.knowledge === "PUBLIC" &&
    exampleScopes.student === "ASSIGNED" &&
    exampleScopes.teaching === "READ" &&
    exampleScopes.research === "NONE" &&
    exampleScopes.localTool === "NONE";
}

function adapterEvidenceReady(schemaEvidence = {}, exampleEvidence = {}) {
  return schemaEvidence.skillInvocationTraceRequired?.const === true &&
    schemaEvidence.inputHashRequired?.const === true &&
    schemaEvidence.outputSummaryRequired?.const === true &&
    schemaEvidence.sourceEvidenceRefsRequired?.const === true &&
    schemaEvidence.studentScopeEvidenceRequired?.const === true &&
    schemaEvidence.runtimeTimingRequired?.const === true &&
    exampleEvidence.skillInvocationTraceRequired === true &&
    exampleEvidence.inputHashRequired === true &&
    exampleEvidence.outputSummaryRequired === true &&
    exampleEvidence.sourceEvidenceRefsRequired === true &&
    exampleEvidence.studentScopeEvidenceRequired === true &&
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
    const report = auditStudentTutorAgentReadonlyContracts(loadInputs(process.cwd()));
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatStudentTutorAgentReadonlyContractAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
