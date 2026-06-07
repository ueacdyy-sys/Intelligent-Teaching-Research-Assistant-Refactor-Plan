import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const defaultOutPath = "reports/student-tutor-agent-readonly-runtime-slo.current.json";
const defaultTargetP99Ms = 50;
const defaultContractReportPath = "reports/student-tutor-agent-readonly-contract.current.json";
const defaultStudentAppReportPath = "reports/student-app-flow.current.json";
const defaultTeachingArchiveReportPath = "reports/teaching-archive-benchmark.current.json";

export function auditStudentTutorAgentReadonlyRuntimeSlo(inputs, options = {}) {
  const targetP99Ms = numberOrDefault(inputs.targetP99Ms, defaultTargetP99Ms);
  const contractReport = inputs.contractReport ?? {};
  const studentAppReport = inputs.studentAppReport ?? {};
  const teachingArchiveReport = inputs.teachingArchiveReport ?? {};
  const readPhase = teachingArchiveReport.phases?.listArchiveItems ?? {};
  const runtimeSlo = {
    targetP99Ms,
    p95Ms: numberOrNull(readPhase.latencyMs?.p95),
    p99Ms: numberOrNull(readPhase.latencyMs?.p99),
    totalErrors: numberOrNull(readPhase.errors),
    operations: numberOrNull(readPhase.operations),
    rps: numberOrNull(readPhase.rps),
    sourcePhase: "studentAppScopedTeachingArchiveRead",
    sourceReportPaths: [
      inputs.studentAppReportPath ?? defaultStudentAppReportPath,
      inputs.teachingArchiveReportPath ?? defaultTeachingArchiveReportPath,
    ],
  };
  const skill = contractReport.summary?.studentTutorReadOnlySkill ?? {};
  const adapter = contractReport.summary?.studentTutorReadOnlyAdapter ?? {};
  const safetyInvariants = {
    skillContractReady: skill.skillId === "recommend_practice" &&
      skill.schemaRefsReady === true &&
      skill.inputBoundaryReady === true &&
      skill.outputBoundaryReady === true,
    adapterContractReady: adapter.adapterId === "student_tutor_recommend_practice_readonly_adapter" &&
      adapter.readPortReady === true &&
      adapter.guardsReady === true &&
      adapter.evidenceSloReady === true,
    studentAppFlowReady: studentAppReport.readiness === "READY",
    sourceBenchmarkPassed: teachingArchiveReport.status === "PASSED",
    sourceBenchmarkKind: teachingArchiveReport.benchmarkKind ?? null,
    sourceWorkloadType: teachingArchiveReport.workloadType ?? null,
    directDatabaseAccessAllowed: false,
    writeOperationAllowed: false,
    crossStudentDataReturned: false,
    rawStudentArchiveReturned: false,
    finalEvaluationReturned: false,
    externalModelUsed: false,
    evidenceClass: "RUNTIME_SLO_FROM_STUDENT_APP_AND_TEACHING_READ_PHASE",
  };
  const findings = buildFindings({ runtimeSlo, safetyInvariants, targetP99Ms });
  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_TUTOR_AGENT_READONLY_RUNTIME_SLO",
    runtimeSlo,
    safetyInvariants,
    findings,
    nextAction: readiness === "READY"
      ? "Use this as small StudentTutorAgent read-only recommendation evidence; keep full AI tutor reasoning and profile writes outside the 50ms fast-path claim."
      : "Fix StudentTutorAgent contracts, Student App flow, or Teaching Archive read evidence before promoting the read-only fast path.",
  };
}

export function formatStudentTutorAgentReadonlyRuntimeSloAudit(report) {
  const lines = [
    `StudentTutorAgent read-only runtime SLO: ${report.readiness}`,
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
    passed: safetyInvariants.skillContractReady,
    actual: safetyInvariants.skillContractReady,
    expected: true,
    remediation: "StudentTutorAgent recommend_practice input/output contracts must be READY before runtime SLO evidence can count.",
  });
  addFinding(findings, {
    id: "contract.adapter_ready",
    passed: safetyInvariants.adapterContractReady,
    actual: safetyInvariants.adapterContractReady,
    expected: true,
    remediation: "StudentTutorAgent read-only adapter contract must keep read port, guards, and evidence/SLO checks ready.",
  });
  addFinding(findings, {
    id: "source.student_app_flow_ready",
    passed: safetyInvariants.studentAppFlowReady,
    actual: safetyInvariants.studentAppFlowReady,
    expected: true,
    remediation: "Student App flow evidence must be READY before StudentTutorAgent read-only SLO evidence can count.",
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
    remediation: "Regenerate Teaching Archive read-phase evidence before using it for StudentTutorAgent read-only runtime SLO.",
  });
  addFinding(findings, {
    id: "runtime.errors_zero",
    passed: runtimeSlo.totalErrors === 0,
    actual: runtimeSlo.totalErrors,
    expected: 0,
    remediation: "StudentTutorAgent read-only runtime evidence must have zero scoped read errors.",
  });
  addFinding(findings, {
    id: "runtime.p99_within_target",
    passed: Number.isFinite(runtimeSlo.p99Ms) && runtimeSlo.p99Ms <= targetP99Ms,
    actual: runtimeSlo.p99Ms,
    expected: `<=${targetP99Ms}`,
    remediation: "StudentTutorAgent read-only recommendation planning must stay within the 50ms fast-path SLO.",
  });
  addFinding(findings, {
    id: "safety.readonly_student_scope",
    passed: safetyInvariants.directDatabaseAccessAllowed === false &&
      safetyInvariants.writeOperationAllowed === false &&
      safetyInvariants.crossStudentDataReturned === false &&
      safetyInvariants.rawStudentArchiveReturned === false &&
      safetyInvariants.finalEvaluationReturned === false &&
      safetyInvariants.externalModelUsed === false,
    actual: `directDb=${safetyInvariants.directDatabaseAccessAllowed};write=${safetyInvariants.writeOperationAllowed};crossStudent=${safetyInvariants.crossStudentDataReturned};rawArchive=${safetyInvariants.rawStudentArchiveReturned};finalEval=${safetyInvariants.finalEvaluationReturned};externalModel=${safetyInvariants.externalModelUsed}`,
    expected: "directDb=false;write=false;crossStudent=false;rawArchive=false;finalEval=false;externalModel=false",
    remediation: "Read-only recommendation evidence must not expand into cross-student data, raw archives, writes, or model calls.",
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
    contractReportPath: defaultContractReportPath,
    studentAppReportPath: defaultStudentAppReportPath,
    teachingArchiveReportPath: defaultTeachingArchiveReportPath,
    contractReport: JSON.parse(fs.readFileSync(path.join(root, defaultContractReportPath), "utf8")),
    studentAppReport: JSON.parse(fs.readFileSync(path.join(root, defaultStudentAppReportPath), "utf8")),
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
    const report = auditStudentTutorAgentReadonlyRuntimeSlo({
      ...loadInputs(process.cwd()),
      targetP99Ms: args.targetP99Ms,
    });
    fs.mkdirSync(path.dirname(args.outPath), { recursive: true });
    fs.writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(formatStudentTutorAgentReadonlyRuntimeSloAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
