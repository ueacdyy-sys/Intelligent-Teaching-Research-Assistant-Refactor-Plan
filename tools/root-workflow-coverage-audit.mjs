import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  allowInProgressQualityGateFromEnv,
  isQualityGateReportPassing,
  summarizeQualityGateReportState,
} from "./quality-gate-report-state.mjs";

const defaultOutPath = "reports/root-workflow-coverage.current.json";
const defaultRootRequirementsPath = "../智能教研助手/项目根本需求（禁止改动）";

export const sourceReports = {
  identity: "reports/identity-access-contract.current.json",
  studentApp: "reports/student-app-flow.current.json",
  teachingArchive: "reports/teaching-archive-benchmark.current.json",
  knowledgePolicy: "reports/knowledge-access-policy.current.json",
  knowledgeRetrieval: "reports/knowledge-retrieval-benchmark.current.json",
  aiWorkerJob: "reports/ai-worker-job.current.json",
  aiWorkerAdmission: "reports/ai-worker-job-admission.current.json",
  aiWorkerDependencies: "reports/ai-worker-runtime-dependency-profile.current.json",
  agentHarness: "reports/agent-harness-flow.current.json",
  workflowPluginFlow: "reports/workflow-plugin-flow.current.json",
  workflowPluginRegistry: "reports/workflow-plugin-registry-admission.current.json",
  workflowPluginRuntimeSlo: "reports/workflow-plugin-runtime-slo.current.json",
  conversationRuntime: "reports/conversation-loadgen-runtime-decision.current.json",
  sustainedScaleUp: "reports/system-sustained-mixed-workload-scaleup.current.json",
  quality: "reports/quality-gate.current.json",
};

export const rootWorkflows = [
  {
    id: "identity_and_remote_entry",
    name: "Identity, teacher/student login, and remote command entry",
    anchors: ["教师端", "学生端", "微信扫码登录", "账号密码登录", "外部操控"],
    reportChecks: [
      ["identity", "READY"],
      ["agentHarness", "READY"],
    ],
    mixedWorkloads: ["identity_http"],
    coverageClass: "CONTRACT_AND_MIXED_SMOKE",
  },
  {
    id: "research_conversation_and_fusion",
    name: "Research conversation, node orchestration, and answer fusion",
    anchors: ["科研模式", "对话", "多个多模态模型融合回答", "节点"],
    reportChecks: [["conversationRuntime", "READY"]],
    mixedWorkloads: ["conversation_write"],
    coverageClass: "PERFORMANCE_DECISION_AND_MIXED_SMOKE",
  },
  {
    id: "teaching_archive_quiz_and_ai_grading",
    name: "Teaching archive, quiz, AI grading, and learning material flows",
    anchors: ["教学模式", "随堂测验", "AI批改", "档案资料", "学生档案"],
    reportChecks: [
      ["teachingArchive", "PASSED"],
      ["studentApp", "READY"],
    ],
    mixedWorkloads: ["teaching_archive"],
    coverageClass: "CONTRACT_AND_MIXED_SMOKE",
  },
  {
    id: "student_app_personalized_learning",
    name: "Student app, own archive access, tutoring, and quiz submissions",
    anchors: ["学生端", "AI辅导助手", "学生档案", "教学资料", "扫码答题"],
    reportChecks: [
      ["studentApp", "READY"],
      ["identity", "READY"],
    ],
    mixedWorkloads: ["teaching_archive"],
    coverageClass: "CONTRACT_AND_SHARED_TEACHING_SMOKE",
  },
  {
    id: "knowledge_access_and_retrieval",
    name: "Public/private knowledge isolation and hybrid retrieval",
    anchors: ["公开知识库", "私密知识库", "物理上的隔断", "RAG检索"],
    reportChecks: [
      ["knowledgePolicy", "READY"],
      ["knowledgeRetrieval", "READY"],
    ],
    mixedWorkloads: ["knowledge_retrieval"],
    coverageClass: "POLICY_AND_MIXED_SMOKE",
  },
  {
    id: "ai_worker_optional_model_runtime",
    name: "AI worker boundary for OCR, RAG, model calls, and training tasks",
    anchors: ["OCR识别", "RAG", "模型训练", "微调"],
    reportChecks: [
      ["aiWorkerJob", "READY"],
      ["aiWorkerAdmission", "READY"],
      ["aiWorkerDependencies", "READY"],
    ],
    mixedWorkloads: ["ai_worker_admission"],
    coverageClass: "WORKER_BOUNDARY_AND_MIXED_ADMISSION_SMOKE",
  },
  {
    id: "agent_harness_local_control",
    name: "Agent harness for desktop application control and approval",
    anchors: ["操纵电脑上的所有应用", "社交平台", "发布命令", "统筹智能体"],
    reportChecks: [
      ["agentHarness", "READY"],
      ["identity", "READY"],
    ],
    mixedWorkloads: ["identity_http", "ai_worker_admission"],
    coverageClass: "CONTRACT_AND_SHARED_MIXED_SMOKE",
  },
  {
    id: "workflow_plugin_self_evolution",
    name: "Generated workflow/plugin self-evolution with sandbox and approval",
    anchors: ["工作流", "插件", "自动测试", "人类评估性能与效果", "自我进化"],
    reportChecks: [
      ["workflowPluginFlow", "READY"],
      ["workflowPluginRegistry", "READY"],
      ["workflowPluginRuntimeSlo", "READY"],
    ],
    mixedWorkloads: [],
    runtimeEvidence: [
      {
        name: "workflow_plugin_runtime_slo",
        reportKey: "workflowPluginRuntimeSlo",
        targetP99Ms: 300,
      },
    ],
    coverageClass: "RUNTIME_SLO_AND_REVIEW_ONLY_EXECUTION",
  },
];

export function auditRootWorkflowCoverage(inputs) {
  const reports = parseReports(inputs.reports ?? {});
  const rootText = String(inputs.rootRequirementsText ?? "");
  const workflows = rootWorkflows.map((workflow) => summarizeWorkflow(workflow, rootText, reports));
  const mixedWorkloadNames = collectMixedWorkloadNames(reports.sustainedScaleUp?.value);
  const findings = [];

  addFinding(findings, {
    id: "root_requirements.present",
    passed: rootText.trim().length > 0,
    actual: rootText.trim().length > 0 ? "present" : "missing",
    expected: "immutable root requirements text is readable",
    remediation: "Read the immutable root requirements file before claiming root workflow coverage.",
  });
  addFinding(findings, {
    id: "root_requirements.anchors_covered",
    passed: workflows.every((workflow) => workflow.rootAnchorStatus === "COVERED"),
    actual: workflows.map((workflow) => `${workflow.id}:${workflow.missingRootAnchors.join("|") || "covered"}`).join(";"),
    expected: "every root workflow maps back to one or more immutable root requirement anchors",
    remediation: "Update the workflow mapping only after reading the root requirement; do not infer coverage from stale docs.",
  });
  addFinding(findings, {
    id: "sources.required_reports_parseable",
    passed: Object.entries(sourceReports).every(([key]) => reports[key]?.parseable === true),
    actual: Object.entries(sourceReports).map(([key, reportPath]) => `${key}:${reports[key]?.parseable === true ? "json" : "missing_or_invalid"}:${reportPath}`).join(";"),
    expected: "all root workflow source reports are readable JSON",
    remediation: "Regenerate the missing or invalid workflow source report before using it as root coverage evidence.",
  });
  addFinding(findings, {
    id: "workflows.coverage_complete",
    passed: workflows.every((workflow) => workflow.coverageStatus === "COVERED"),
    actual: workflows.map((workflow) => `${workflow.id}:${workflow.coverageStatus}`).join(";"),
    expected: "every root workflow has passing contract, policy, or mixed-smoke evidence",
    remediation: "Add the missing workflow contract, policy audit, or mixed workload evidence before capacity promotion review.",
  });
  addFinding(findings, {
    id: "performance.mixed_workload_names_present",
    passed: ["identity_http", "conversation_write", "teaching_archive", "knowledge_retrieval", "ai_worker_admission"]
      .every((name) => mixedWorkloadNames.includes(name)),
    actual: mixedWorkloadNames.join(","),
    expected: "identity_http, conversation_write, teaching_archive, knowledge_retrieval, ai_worker_admission",
    remediation: "Keep every current root performance slice in the sustained scale-up report.",
  });
  addFinding(findings, {
    id: "baseline.no_forbidden_ai_runtime_dependencies",
    passed: forbiddenAiPackageHits(reports.aiWorkerDependencies?.value) === 0,
    actual: forbiddenAiPackageHits(reports.aiWorkerDependencies?.value),
    expected: 0,
    remediation: "Keep model, OCR, RAG, vector, embedding, and training dependencies outside the baseline runtime.",
  });
  addFinding(findings, {
    id: "quality.gate_passed",
    passed: isQualityGateReportPassing(reports.quality?.value, {
      allowInProgress: allowInProgressQualityGateFromEnv(),
    }),
    actual: summarizeQualityGateReportState(reports.quality?.value),
    expected: "quality gate allPassed=true",
    remediation: "Root workflow coverage must not be used from a workspace whose strict quality gate is failing.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: new Date().toISOString(),
    readiness,
    workloadType: "ROOT_WORKFLOW_COVERAGE",
    rootRequirements: {
      sourcePath: inputs.rootRequirementsPath ?? null,
      anchorCount: workflows.reduce((total, workflow) => total + workflow.matchedRootAnchors.length, 0),
    },
    summary: summarizeCoverage(workflows, mixedWorkloadNames),
    workflows,
    findings,
    nextAction: readiness === "READY"
      ? "Treat this as root workflow coverage evidence only; cross-module database and queue diagnostics plus root SLO promotion review remain required."
      : "Fix missing root workflow coverage before using current performance evidence for whole-system capacity review.",
  };
}

export function formatRootWorkflowCoverageAudit(report) {
  const lines = [
    `Root workflow coverage: ${report.readiness}`,
    `Covered workflows: ${report.summary.coveredWorkflows}/${report.summary.totalWorkflows}`,
    `Mixed workload names: ${report.summary.mixedWorkloadNames.join(",")}`,
    "",
    "Workflow coverage:",
  ];
  for (const workflow of report.workflows) {
    lines.push(`- ${workflow.id}: ${workflow.coverageStatus} ${workflow.coverageClass}`);
  }
  lines.push("", "Findings:");
  for (const finding of report.findings) {
    lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: actual=${stringifyScalar(finding.actual)} expected=${stringifyScalar(finding.expected)}`);
    if (!finding.passed) lines.push(`  ${finding.remediation}`);
  }
  lines.push("", report.nextAction);
  return lines.join("\n");
}

function summarizeWorkflow(workflow, rootText, reports) {
  const matchedRootAnchors = workflow.anchors.filter((anchor) => containsText(rootText, anchor));
  const reportResults = workflow.reportChecks.map(([key, expected]) => ({
    key,
    expected,
    actual: sourceStatus(reports[key]?.value),
    reportPath: sourceReports[key],
    passed: reports[key]?.parseable === true && sourceStatus(reports[key]?.value) === expected,
  }));
  const mixedWorkloadNames = collectMixedWorkloadNames(reports.sustainedScaleUp?.value);
  const mixedWorkloadResults = workflow.mixedWorkloads.map((name) => ({
    name,
    passed: mixedWorkloadNames.includes(name),
  }));
  const runtimeEvidenceResults = (workflow.runtimeEvidence ?? []).map((evidence) =>
    summarizeRuntimeEvidence(evidence, reports),
  );
  const coverageStatus = matchedRootAnchors.length > 0 &&
    reportResults.every((result) => result.passed) &&
    mixedWorkloadResults.every((result) => result.passed) &&
    runtimeEvidenceResults.every((result) => result.passed)
    ? "COVERED"
    : "NEEDS_EVIDENCE";
  return {
    id: workflow.id,
    name: workflow.name,
    coverageClass: workflow.coverageClass,
    coverageStatus,
    rootAnchorStatus: matchedRootAnchors.length > 0 ? "COVERED" : "MISSING",
    matchedRootAnchors,
    missingRootAnchors: workflow.anchors.filter((anchor) => !matchedRootAnchors.includes(anchor)),
    reportResults,
    mixedWorkloadResults,
    runtimeEvidenceResults,
  };
}

function summarizeCoverage(workflows, mixedWorkloadNames) {
  const coveredWorkflows = workflows.filter((workflow) => workflow.coverageStatus === "COVERED");
  const mixedCoveredWorkflows = workflows.filter((workflow) =>
    workflow.mixedWorkloadResults.length > 0 && workflow.mixedWorkloadResults.every((result) => result.passed),
  );
  const runtimeCoveredWorkflows = workflows.filter((workflow) =>
    workflow.runtimeEvidenceResults.length > 0 && workflow.runtimeEvidenceResults.every((result) => result.passed),
  );
  const contractOnlyWorkflows = workflows.filter((workflow) =>
    workflow.mixedWorkloadResults.length === 0 && workflow.runtimeEvidenceResults.length === 0,
  );
  return {
    totalWorkflows: workflows.length,
    coveredWorkflows: coveredWorkflows.length,
    mixedCoveredWorkflows: mixedCoveredWorkflows.length,
    runtimeCoveredWorkflows: runtimeCoveredWorkflows.length,
    contractOnlyWorkflows: contractOnlyWorkflows.length,
    mixedWorkloadNames,
  };
}

function summarizeRuntimeEvidence(evidence, reports) {
  const report = reports[evidence.reportKey]?.value;
  const p99Ms = numberOrNull(report?.runtimeSlo?.p99Ms);
  const totalErrors = numberOrNull(report?.runtimeSlo?.totalErrors);
  const targetP99Ms = numberOrNull(evidence.targetP99Ms);
  return {
    name: evidence.name,
    reportKey: evidence.reportKey,
    reportPath: sourceReports[evidence.reportKey],
    targetP99Ms,
    p99Ms,
    totalErrors,
    passed: reports[evidence.reportKey]?.parseable === true &&
      sourceStatus(report) === "READY" &&
      Number.isFinite(p99Ms) &&
      Number.isFinite(targetP99Ms) &&
      p99Ms <= targetP99Ms &&
      totalErrors === 0,
  };
}

function collectMixedWorkloadNames(report) {
  if (!report || typeof report !== "object") return [];
  const names = new Set();
  for (const step of report.steps ?? []) {
    for (const workload of step.workloads ?? []) {
      if (typeof workload.name === "string") names.add(workload.name);
    }
  }
  return [...names].sort();
}

function forbiddenAiPackageHits(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.findings)) return null;
  const finding = report.findings.find((candidate) => candidate.id === "baseline.no_forbidden_ai_packages");
  return String(finding?.actual ?? "").toLowerCase() === "none" ? 0 : null;
}

function parseReports(reports) {
  return Object.fromEntries(Object.entries(sourceReports).map(([key, reportPath]) => {
    const text = reports[reportPath];
    if (typeof text !== "string" || text.trim().length === 0) {
      return [key, { present: false, parseable: false }];
    }
    try {
      return [key, { present: true, parseable: true, value: JSON.parse(text) }];
    } catch (error) {
      return [key, { present: true, parseable: false, error: error.message }];
    }
  }));
}

function sourceStatus(report) {
  if (!report || typeof report !== "object") return "MISSING";
  if (typeof report.readiness === "string") return report.readiness;
  if (typeof report.status === "string") return report.status;
  if (report.decision === "ALLOW_SAVE") return "READY";
  if (typeof report.decision === "string") return report.decision;
  if (typeof report.allPassed === "boolean") return report.allPassed ? "PASSED" : "FAILED";
  return "UNKNOWN";
}

function containsText(text, needle) {
  return String(text).toLowerCase().includes(String(needle).toLowerCase());
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

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function loadCurrentInputs(root, rootRequirementsPath) {
  const absoluteRootRequirements = path.resolve(root, rootRequirementsPath);
  return {
    rootRequirementsPath,
    rootRequirementsText: fs.readFileSync(absoluteRootRequirements, "utf8"),
    reports: Object.fromEntries(Object.values(sourceReports).map((reportPath) => [
      reportPath,
      fs.readFileSync(path.join(root, reportPath), "utf8"),
    ])),
  };
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  const rootRequirementsIndex = argv.indexOf("--root-requirements");
  return {
    out: outIndex === -1 ? defaultOutPath : argv[outIndex + 1],
    rootRequirementsPath: rootRequirementsIndex === -1
      ? defaultRootRequirementsPath
      : argv[rootRequirementsIndex + 1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = process.cwd();
    const args = parseArgs(process.argv.slice(2));
    const report = auditRootWorkflowCoverage(loadCurrentInputs(root, args.rootRequirementsPath));
    writeReport(root, args.out, report);
    console.log(formatRootWorkflowCoverageAudit(report));
    process.exit(report.readiness === "READY" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
