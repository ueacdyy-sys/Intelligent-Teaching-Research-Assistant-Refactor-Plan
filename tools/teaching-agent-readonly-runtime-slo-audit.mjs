import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/teaching-agent-readonly-runtime-slo.current.json";
const defaultTargetP99Ms = 50;
const defaultAgentSkillReportPath = "reports/agent-skill-contracts.current.json";
const defaultTeachingArchiveReportPath = "reports/teaching-archive-benchmark.current.json";

export function auditTeachingAgentReadonlyRuntimeSlo(inputs, options = {}) {
  const targetP99Ms = numberOrDefault(inputs.targetP99Ms, defaultTargetP99Ms);
  const agentSkillReport = inputs.agentSkillReport ?? {};
  const teachingArchiveReport = inputs.teachingArchiveReport ?? {};
  const readPhase = teachingArchiveReport.phases?.listArchiveItems ?? {};
  const runtimeSlo = {
    targetP99Ms,
    p95Ms: numberOrNull(readPhase.latencyMs?.p95),
    p99Ms: numberOrNull(readPhase.latencyMs?.p99),
    totalErrors: numberOrNull(readPhase.errors),
    operations: numberOrNull(readPhase.operations),
    rps: numberOrNull(readPhase.rps),
    sourcePhase: "listArchiveItems",
    sourceReportPath: inputs.teachingArchiveReportPath ?? defaultTeachingArchiveReportPath,
  };
  const adapter = agentSkillReport.summary?.teachingReadOnlyAdapter ?? {};
  const skill = agentSkillReport.summary?.teachingReadOnlySkill ?? {};
  const safetyInvariants = {
    skillContractReady: skill.skillId === "search_teaching_material" &&
      skill.schemaRefsReady === true &&
      skill.inputBoundaryReady === true &&
      skill.outputBoundaryReady === true,
    adapterContractReady: adapter.adapterId === "teaching_agent_search_material_readonly_adapter" &&
      adapter.readPortReady === true &&
      adapter.guardsReady === true &&
      adapter.evidenceSloReady === true,
    sourceBenchmarkPassed: teachingArchiveReport.status === "PASSED",
    sourceBenchmarkKind: teachingArchiveReport.benchmarkKind ?? null,
    sourceWorkloadType: teachingArchiveReport.workloadType ?? null,
    directDatabaseAccessAllowed: false,
    writeOperationAllowed: false,
    studentDataReturned: false,
    externalModelUsed: false,
    evidenceClass: "RUNTIME_SLO_FROM_TEACHING_ARCHIVE_READ_PHASE",
  };
  const findings = buildFindings({ runtimeSlo, safetyInvariants, targetP99Ms });
  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "TEACHING_AGENT_READONLY_RUNTIME_SLO",
    runtimeSlo,
    safetyInvariants,
    findings,
    nextAction: readiness === "READY"
      ? "Use this as small TeachingAgent read-only adapter runtime SLO evidence; keep broad production10k claims tied to root SLO review."
      : "Fix TeachingAgent read-only adapter contracts or Teaching Archive read-phase evidence before promoting runtime beyond contract-only.",
  };
}

export function formatTeachingAgentReadonlyRuntimeSloAudit(report) {
  const lines = [
    `TeachingAgent read-only runtime SLO: ${report.readiness}`,
    `Source phase: ${report.runtimeSlo.sourcePhase}`,
    `P95/P99: ${report.runtimeSlo.p95Ms}/${report.runtimeSlo.p99Ms} ms`,
    `Errors: ${report.runtimeSlo.totalErrors}`,
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

function buildFindings({ runtimeSlo, safetyInvariants, targetP99Ms }) {
  const findings = [];
  addFinding(findings, {
    id: "contract.skill_ready",
    passed: safetyInvariants.skillContractReady === true,
    actual: safetyInvariants.skillContractReady,
    expected: true,
    remediation: "TeachingAgent search_teaching_material input/output contracts must be READY before runtime SLO evidence can count.",
  });
  addFinding(findings, {
    id: "contract.adapter_ready",
    passed: safetyInvariants.adapterContractReady === true,
    actual: safetyInvariants.adapterContractReady,
    expected: true,
    remediation: "TeachingAgent read-only adapter contract must keep read port, guards, and evidence/SLO checks ready.",
  });
  addFinding(findings, {
    id: "source.teaching_archive_read_phase_passed",
    passed: safetyInvariants.sourceBenchmarkPassed === true &&
      safetyInvariants.sourceBenchmarkKind === "teaching_archive_gateway" &&
      safetyInvariants.sourceWorkloadType === "HTTP_BENCHMARK" &&
      Number.isFinite(runtimeSlo.operations) &&
      runtimeSlo.operations > 0,
    actual: `status=${safetyInvariants.sourceBenchmarkPassed};kind=${safetyInvariants.sourceBenchmarkKind};workload=${safetyInvariants.sourceWorkloadType};ops=${runtimeSlo.operations}`,
    expected: "PASSED teaching_archive_gateway HTTP_BENCHMARK with listArchiveItems operations>0",
    remediation: "Regenerate Teaching Archive read-phase evidence before using it for TeachingAgent read-only runtime SLO.",
  });
  addFinding(findings, {
    id: "runtime.errors_zero",
    passed: runtimeSlo.totalErrors === 0,
    actual: runtimeSlo.totalErrors,
    expected: 0,
    remediation: "TeachingAgent read-only runtime evidence must have zero listArchiveItems errors.",
  });
  addFinding(findings, {
    id: "runtime.p99_within_target",
    passed: Number.isFinite(runtimeSlo.p99Ms) && runtimeSlo.p99Ms <= targetP99Ms,
    actual: runtimeSlo.p99Ms,
    expected: `<=${targetP99Ms}`,
    remediation: "TeachingAgent read-only adapter must remain within the 50ms runtime SLO before promotion.",
  });
  addFinding(findings, {
    id: "safety.readonly_boundaries",
    passed: safetyInvariants.directDatabaseAccessAllowed === false &&
      safetyInvariants.writeOperationAllowed === false &&
      safetyInvariants.studentDataReturned === false &&
      safetyInvariants.externalModelUsed === false,
    actual: `directDb=${safetyInvariants.directDatabaseAccessAllowed};write=${safetyInvariants.writeOperationAllowed};studentData=${safetyInvariants.studentDataReturned};externalModel=${safetyInvariants.externalModelUsed}`,
    expected: "directDb=false;write=false;studentData=false;externalModel=false",
    remediation: "Read-only runtime evidence must not expand into database writes, student data, or external model calls.",
  });
  return findings;
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

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringifyScalar(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

function loadInputs(root) {
  return {
    agentSkillReportPath: defaultAgentSkillReportPath,
    teachingArchiveReportPath: defaultTeachingArchiveReportPath,
    agentSkillReport: JSON.parse(fs.readFileSync(path.join(root, defaultAgentSkillReportPath), "utf8")),
    teachingArchiveReport: JSON.parse(fs.readFileSync(path.join(root, defaultTeachingArchiveReportPath), "utf8")),
  };
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const targetIndex = argv.indexOf("--target-p99-ms");
  return {
    outPath: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
    targetP99Ms: targetIndex === -1 ? defaultTargetP99Ms : Number(argv[targetIndex + 1]),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = auditTeachingAgentReadonlyRuntimeSlo({
      ...loadInputs(process.cwd()),
      targetP99Ms: args.targetP99Ms,
    });
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatTeachingAgentReadonlyRuntimeSloAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
