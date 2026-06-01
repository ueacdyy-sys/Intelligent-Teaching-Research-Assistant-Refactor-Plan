import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  auditRootWorkflowCoverage,
  formatRootWorkflowCoverageAudit,
  rootWorkflows,
  sourceReports,
} from "./root-workflow-coverage-audit.mjs";

describe("root workflow coverage audit", () => {
  it("passes when every immutable-root workflow has current evidence", () => {
    const report = auditRootWorkflowCoverage(currentInputs());

    assert.equal(report.readiness, "READY");
    assert.equal(report.summary.totalWorkflows, rootWorkflows.length);
    assert.equal(report.summary.coveredWorkflows, rootWorkflows.length);
    assert.equal(report.summary.contractOnlyWorkflows, 1);
    assert.match(formatRootWorkflowCoverageAudit(report), /Root workflow coverage: READY/u);
    assert.deepEqual(report.summary.mixedWorkloadNames, [
      "ai_worker_admission",
      "conversation_write",
      "identity_http",
      "knowledge_retrieval",
      "teaching_archive",
    ]);
  });

  it("fails when the immutable root requirement text is missing", () => {
    const inputs = currentInputs();
    inputs.rootRequirementsText = "";

    const report = auditRootWorkflowCoverage(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "root_requirements.present").passed, false);
    assert.equal(report.findings.find((finding) => finding.id === "root_requirements.anchors_covered").passed, false);
  });

  it("fails when a required source report is missing", () => {
    const inputs = currentInputs();
    delete inputs.reports[sourceReports.studentApp];

    const report = auditRootWorkflowCoverage(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "sources.required_reports_parseable").passed, false);
    assert.equal(report.workflows.find((workflow) => workflow.id === "student_app_personalized_learning").coverageStatus, "NEEDS_EVIDENCE");
  });

  it("fails when sustained scale-up drops a root mixed workload", () => {
    const inputs = currentInputs();
    const scaleup = JSON.parse(inputs.reports[sourceReports.sustainedScaleUp]);
    for (const step of scaleup.steps) {
      step.workloads = step.workloads.filter((workload) => workload.name !== "teaching_archive");
    }
    inputs.reports[sourceReports.sustainedScaleUp] = JSON.stringify(scaleup);

    const report = auditRootWorkflowCoverage(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "performance.mixed_workload_names_present").passed, false);
    assert.equal(report.workflows.find((workflow) => workflow.id === "teaching_archive_quiz_and_ai_grading").coverageStatus, "NEEDS_EVIDENCE");
  });

  it("fails when forbidden AI runtime dependencies re-enter baseline", () => {
    const inputs = currentInputs();
    const dependencies = JSON.parse(inputs.reports[sourceReports.aiWorkerDependencies]);
    dependencies.findings = dependencies.findings.map((finding) =>
      finding.id === "baseline.no_forbidden_ai_packages" ? { ...finding, actual: "torch" } : finding,
    );
    inputs.reports[sourceReports.aiWorkerDependencies] = JSON.stringify(dependencies);

    const report = auditRootWorkflowCoverage(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "baseline.no_forbidden_ai_runtime_dependencies").passed, false);
  });

  it("fails when strict quality evidence is not passing", () => {
    const inputs = currentInputs();
    const quality = JSON.parse(inputs.reports[sourceReports.quality]);
    quality.allPassed = false;
    inputs.reports[sourceReports.quality] = JSON.stringify(quality);

    const report = auditRootWorkflowCoverage(inputs);

    assert.equal(report.readiness, "NEEDS_REMEDIATION");
    assert.equal(report.findings.find((finding) => finding.id === "quality.gate_passed").passed, false);
  });
});

function currentInputs() {
  return {
    rootRequirementsPath: "../智能教研助手/项目根本需求（禁止改动）",
    rootRequirementsText: [
      "教师端 微信扫码登录 账号密码登录 学生端 外部操控",
      "科研模式 对话 多个多模态模型融合回答 节点",
      "教学模式 随堂测验 AI批改 档案资料 学生档案",
      "AI辅导助手 教学资料 扫码答题",
      "公开知识库 私密知识库 物理上的隔断 RAG检索",
      "OCR识别 RAG 模型训练 微调",
      "操纵电脑上的所有应用 社交平台 发布命令 统筹智能体",
      "工作流 插件 自动测试 人类评估性能与效果 自我进化",
    ].join("\n"),
    reports: {
      [sourceReports.identity]: JSON.stringify(readyReport()),
      [sourceReports.studentApp]: JSON.stringify(readyReport()),
      [sourceReports.teachingArchive]: JSON.stringify(passedReport()),
      [sourceReports.knowledgePolicy]: JSON.stringify(readyReport()),
      [sourceReports.knowledgeRetrieval]: JSON.stringify(readyReport()),
      [sourceReports.aiWorkerJob]: JSON.stringify(readyReport()),
      [sourceReports.aiWorkerAdmission]: JSON.stringify(readyReport()),
      [sourceReports.aiWorkerDependencies]: JSON.stringify(aiWorkerDependenciesReport()),
      [sourceReports.agentHarness]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginFlow]: JSON.stringify(readyReport()),
      [sourceReports.workflowPluginRegistry]: JSON.stringify({ decision: "ALLOW_SAVE" }),
      [sourceReports.conversationRuntime]: JSON.stringify(readyReport()),
      [sourceReports.sustainedScaleUp]: JSON.stringify(sustainedScaleupReport()),
      [sourceReports.quality]: JSON.stringify({ allPassed: true }),
    },
  };
}

function readyReport() {
  return { readiness: "READY" };
}

function passedReport() {
  return { status: "PASSED" };
}

function aiWorkerDependenciesReport() {
  return {
    readiness: "READY",
    findings: [{ id: "baseline.no_forbidden_ai_packages", actual: "none" }],
  };
}

function sustainedScaleupReport() {
  return {
    status: "PASSED",
    steps: [
      {
        name: "low",
        workloads: [
          { name: "identity_http" },
          { name: "conversation_write" },
          { name: "teaching_archive" },
          { name: "knowledge_retrieval" },
          { name: "ai_worker_admission" },
        ],
      },
    ],
  };
}
