import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const sourceRoots = ["services", "tools", "contracts", "docs", "README.md", "package.json"];
const sourceExtensions = new Set([".go", ".mjs", ".md", ".yaml", ".yml", ".json", ".rs", ".toml"]);
const defaultReportPath = "reports/quality-gate.current.json";
const inProgressStatus = "IN_PROGRESS";
const qualityGateInProgressEnv = "ITA_QUALITY_GATE_IN_PROGRESS";
const runtimeMarkerPattern = /\b(TODO|FIXME|HACK|XXX)\b/;
const goServicePatterns = [
  "./services/conversation-write-gateway/...",
  "./services/identity-access-gateway/...",
  "./services/teaching-archive-gateway/...",
];
const goServiceDirs = [
  "services/conversation-write-gateway",
  "services/identity-access-gateway",
  "services/teaching-archive-gateway",
];

export function checkFileSizeThreshold(files, options = {}) {
  const maxLines = options.maxLines ?? 800;
  return files
    .map((file) => ({ ...file, lines: countLines(file.text) }))
    .filter((file) => file.lines > maxLines)
    .map((file) => ({
      id: "source.file_size",
      path: normalizePath(file.path),
      passed: false,
      message: `${normalizePath(file.path)} has ${file.lines} lines; max is ${maxLines}`,
    }));
}

export function checkNoRuntimeTodoMarkers(files) {
  const findings = [];
  for (const file of files) {
    const filePath = normalizePath(file.path);
    if (!isRuntimeSource(filePath)) continue;
    const lines = file.text.split(/\r\n|\r|\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (runtimeMarkerPattern.test(lines[index])) {
        findings.push({
          id: "source.runtime_todo",
          path: filePath,
          passed: false,
          message: `${filePath}:${index + 1} contains unfinished runtime marker`,
        });
      }
    }
  }
  return findings;
}

export function checkArchitectureBoundaries(files) {
  const findings = [];
  for (const file of files) {
    const filePath = normalizePath(file.path);
    if (!filePath.endsWith(".go") || !isInnerLayerFile(filePath)) continue;
    for (const importPath of extractGoImports(file.text)) {
      if (!isForbiddenInnerImport(importPath)) continue;
      findings.push({
        id: "architecture.inner_import",
        path: filePath,
        passed: false,
        message: `${filePath} imports forbidden inner-layer dependency ${importPath}`,
      });
    }
  }
  return findings;
}

export function checkGoFormatOutput(output) {
  const files = output
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return files.map((filePath) => ({
    id: "source.gofmt",
    path: normalizePath(filePath),
    passed: false,
    message: `${normalizePath(filePath)} is not gofmt-formatted`,
  }));
}

export function checkRustFormatResult(result) {
  if (result.status === 0 && !result.error) return [];
  return [{
    id: "source.rustfmt",
    path: "services/agent-harness",
    passed: false,
    message: `services/agent-harness is not rustfmt-formatted${result.error ? `: ${result.error.message}` : ""}`,
  }];
}

export function buildQualityCommandPlan() {
  return [
    {
      name: "go vet",
      command: "go",
      args: ["vet", ...goServicePatterns],
    },
    {
      name: "cargo test",
      command: "cargo",
      args: ["test", "--manifest-path", "services/agent-harness/Cargo.toml"],
    },
    { name: "identity session runtime audit", command: npmCommand(), args: ["run", "audit:identity-session-runtime"] },
    { name: "identity access contract audit", command: npmCommand(), args: ["run", "audit:identity-access"] },
    { name: "student app flow audit", command: npmCommand(), args: ["run", "audit:student-app-flow"] },
    { name: "agent harness flow audit", command: npmCommand(), args: ["run", "audit:agent-harness-flow"] },
    { name: "agent skill contract audit", command: npmCommand(), args: ["run", "audit:agent-skill-contracts"] },
    { name: "TeachingAgent read-only runtime SLO audit", command: npmCommand(), args: ["run", "audit:teaching-agent-readonly-runtime-slo"] },
    { name: "TeachingAgent read-only runtime adapter audit", command: npmCommand(), args: ["run", "audit:teaching-agent-readonly-runtime-adapter"] },
    { name: "StudentTutorAgent read-only contract audit", command: npmCommand(), args: ["run", "audit:student-tutor-agent-readonly-contract"] },
    { name: "StudentTutorAgent read-only runtime SLO audit", command: npmCommand(), args: ["run", "audit:student-tutor-agent-readonly-runtime-slo"] },
    { name: "StudentTutorAgent read-only runtime adapter audit", command: npmCommand(), args: ["run", "audit:student-tutor-agent-readonly-runtime-adapter"] },
    { name: "Student App AI Tutor request runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-request"] },
    { name: "Student App AI Tutor published learning action source audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-published-learning-action-source"] },
    { name: "Student App AI Tutor worker study packet input audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-worker-study-packet-input"] },
    { name: "Student App AI Tutor worker result archive input audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-worker-result-archive-input"] },
    { name: "Student App AI Tutor model execution precheck runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-model-execution-precheck"] },
    { name: "Student App AI Tutor result-archive model execution precheck audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-model-execution-precheck"] },
    { name: "Student App AI Tutor result-archive controlled answer artifact audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-controlled-answer-artifact"] },
    { name: "Student App AI Tutor result-archive answer review gate audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-answer-review-gate"] },
    { name: "Student App AI Tutor result-archive reviewed result persistence bridge audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-reviewed-result-persistence-bridge"] },
    { name: "Student App AI Tutor result-archive student visibility review audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-student-visibility-review"] },
    { name: "Student App AI Tutor result-archive student delivery envelope audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-student-delivery-envelope"] },
    { name: "Student App AI Tutor result-archive student archive persistence command audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-student-archive-persistence-command"] },
    { name: "Student App AI Tutor result-archive student archive storage commit audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-student-archive-storage-commit"] },
    { name: "Student App AI Tutor result-archive student archive row verification audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-student-archive-row-verification"] },
    { name: "Student App AI Tutor result-archive student archive read audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-student-archive-read"] },
    { name: "Student App AI Tutor result-archive student archive render audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-student-archive-render"] },
    { name: "Student App AI Tutor result-archive student archive learning actions audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-student-archive-learning-actions"] },
    { name: "Student App AI Tutor result-archive follow-up queue admission audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-follow-up-queue-admission"] },
    { name: "Student App AI Tutor result-archive follow-up worker continuity audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-follow-up-worker-continuity"] },
    { name: "Student App AI Tutor result-archive follow-up depth/budget guard audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-follow-up-depth-budget-guard"] },
    { name: "Student App AI Tutor result-archive follow-up queue idempotency guard audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-follow-up-queue-idempotency-guard"] },
    { name: "Student App AI Tutor result-archive follow-up lineage guard audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-archive-follow-up-lineage-guard"] },
    { name: "Student App AI Tutor request progress timeline audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-request-progress-timeline"] },
    { name: "Student App AI Tutor request progress detail audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-request-progress-detail"] },
    { name: "Student App AI Tutor request progress primary action audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-request-progress-primary-action"] },
    { name: "Student App AI Tutor request progress target URL audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-request-progress-target-url"] },
    { name: "Student App AI Tutor request progress refresh policy audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-request-progress-refresh-policy"] },
    { name: "Student App AI Tutor controlled answer artifact runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-controlled-answer-artifact"] },
    { name: "Student App AI Tutor answer review gate runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-answer-review-gate"] },
    { name: "Student App AI Tutor reviewed result persistence bridge runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-reviewed-result-persistence-bridge"] },
    { name: "Student App AI Tutor result student visibility review runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-student-visibility-review"] },
    { name: "Student App AI Tutor result student delivery envelope runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-student-delivery-envelope"] },
    { name: "Student App AI Tutor result student archive persistence command runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-student-archive-persistence-command"] },
    { name: "Student App AI Tutor result student archive storage commit runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-student-archive-storage-commit"] },
    { name: "Student App AI Tutor result student archive row verification runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-student-archive-row-verification"] },
    { name: "Student App AI Tutor result student archive read runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-student-archive-read"] },
    { name: "Student App AI Tutor result student archive render runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-student-archive-render"] },
    { name: "Student App AI Tutor result student archive learning actions runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result-student-archive-learning-actions"] },
    { name: "Student App AI Tutor worker claim runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-worker-claim"] },
    { name: "Student App AI Tutor result runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-result"] },
    { name: "Student App AI Tutor question-bank draft generation plan runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-plan"] },
    { name: "Student App AI Tutor question-bank draft generation worker claim precheck runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim-precheck"] },
    { name: "Student App AI Tutor question-bank draft generation worker claim runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-worker-claim"] },
    { name: "Student App AI Tutor question-bank draft generation input envelope runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-input-envelope"] },
    { name: "Student App AI Tutor question-bank draft generation model execution precheck runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck"] },
    { name: "Student App AI Tutor question-bank draft generation controlled draft runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-controlled-draft"] },
    { name: "Student App AI Tutor question-bank draft generation teacher review runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-teacher-review"] },
    { name: "Student App AI Tutor question-bank draft generation content storage commit runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-content-storage-commit"] },
    { name: "Student App AI Tutor question-bank draft generation content row verification runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-generation-content-row-verification"] },
    { name: "Student App AI Tutor question-bank draft visibility runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-visibility"] },
    { name: "Student App AI Tutor question-bank draft content precheck runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-content-precheck"] },
    { name: "Student App AI Tutor question-bank draft content read foundation audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-content-read"] },
    { name: "Student App AI Tutor question-bank draft content student read verification runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-content-student-read-verification"] },
    { name: "Student App AI Tutor question-bank draft answer submission foundation audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-submission"] },
    { name: "Student App AI Tutor question-bank draft answer submission verification runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-submission-verification"] },
    { name: "Student App AI Tutor question-bank draft answer scoring request foundation audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request"] },
    { name: "Student App AI Tutor question-bank draft answer scoring request verification runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-request-verification"] },
    { name: "Student App AI Tutor question-bank draft answer scoring model execution precheck runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-model-execution-precheck"] },
    { name: "Student App AI Tutor question-bank draft answer controlled scoring artifact runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact"] },
    { name: "Student App AI Tutor question-bank draft answer scoring result persistence bridge runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge"] },
    { name: "Student App AI Tutor question-bank draft answer scoring input foundation audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-input"] },
    { name: "Student App AI Tutor question-bank draft answer scoring result foundation audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-result"] },
    { name: "Student App AI Tutor question-bank draft answer scoring completion bridge audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-completion-bridge"] },
    { name: "Student App AI Tutor question-bank draft answer feedback publication precheck runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-precheck"] },
    { name: "Student App AI Tutor question-bank draft answer feedback generation model execution precheck runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-generation-model-execution-precheck"] },
    { name: "Student App AI Tutor question-bank draft answer feedback controlled draft runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-controlled-draft"] },
    { name: "Student App AI Tutor question-bank draft answer reviewed feedback artifact controlled draft source runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact-controlled-draft-source"] },
    { name: "Student App AI Tutor question-bank draft answer feedback publication approval controlled draft source runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval-controlled-draft-source"] },
    { name: "Student App AI Tutor question-bank draft answer feedback delivery envelope controlled draft source runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope-controlled-draft-source"] },
    { name: "Student App AI Tutor question-bank draft answer feedback archive persistence command controlled draft source runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command-controlled-draft-source"] },
    { name: "Student App AI Tutor question-bank draft answer feedback archive storage commit controlled draft source runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit-controlled-draft-source"] },
    { name: "Student App AI Tutor question-bank draft answer feedback archive row verification controlled draft source runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification-controlled-draft-source"] },
    { name: "Student App AI Tutor question-bank draft answer reviewed feedback artifact runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-reviewed-feedback-artifact"] },
    { name: "Student App AI Tutor question-bank draft answer feedback publication approval runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-publication-approval"] },
    { name: "Student App AI Tutor question-bank draft answer feedback delivery envelope runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-delivery-envelope"] },
    { name: "Student App AI Tutor question-bank draft answer feedback archive persistence command runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-persistence-command"] },
    { name: "Student App AI Tutor question-bank draft answer feedback archive storage commit runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-storage-commit"] },
    { name: "Student App AI Tutor question-bank draft answer feedback archive row verification runtime audit", command: npmCommand(), args: ["run", "audit:student-app-ai-tutor-question-bank-draft-answer-feedback-archive-row-verification"] },
    { name: "ResearchAgent read-only contract audit", command: npmCommand(), args: ["run", "audit:research-agent-readonly-contract"] },
    { name: "ResearchAgent read-only runtime adapter audit", command: npmCommand(), args: ["run", "audit:research-agent-readonly-runtime-adapter"] },
    { name: "Research deep_research intent runtime audit", command: npmCommand(), args: ["run", "audit:research-deep-research-intent-runtime"] },
    { name: "Research deep_research worker lifecycle audit", command: npmCommand(), args: ["run", "audit:research-deep-research-worker-lifecycle"] },
    { name: "Research deep_research retrieval plan audit", command: npmCommand(), args: ["run", "audit:research-deep-research-retrieval-plan"] },
    { name: "Research deep_research retrieval execution audit", command: npmCommand(), args: ["run", "audit:research-deep-research-retrieval-execution"] },
    { name: "Research deep_research reasoning synthesis audit", command: npmCommand(), args: ["run", "audit:research-deep-research-reasoning-synthesis"] },
    { name: "Research deep_research final answer review audit", command: npmCommand(), args: ["run", "audit:research-deep-research-final-answer-review"] },
    { name: "Research deep_research finalization audit", command: npmCommand(), args: ["run", "audit:research-deep-research-finalization"] },
    { name: "Research deep_research render preview audit", command: npmCommand(), args: ["run", "audit:research-deep-research-render-preview"] },
    { name: "Research deep_research publication precheck audit", command: npmCommand(), args: ["run", "audit:research-deep-research-publication-precheck"] },
    { name: "Research deep_research teacher delivery audit", command: npmCommand(), args: ["run", "audit:research-deep-research-teacher-delivery"] },
    { name: "Research deep_research student visibility review audit", command: npmCommand(), args: ["run", "audit:research-deep-research-student-visibility-review"] },
    { name: "Research deep_research student delivery audit", command: npmCommand(), args: ["run", "audit:research-deep-research-student-delivery"] },
    { name: "Research deep_research student archive persistence audit", command: npmCommand(), args: ["run", "audit:research-deep-research-student-archive-persistence"] },
    { name: "Research deep_research student archive projection review audit", command: npmCommand(), args: ["run", "audit:research-deep-research-student-archive-projection-review"] },
    { name: "Research deep_research student archive projection audit", command: npmCommand(), args: ["run", "audit:research-deep-research-student-archive-projection"] },
    { name: "Research deep_research student archive storage precommit audit", command: npmCommand(), args: ["run", "audit:research-deep-research-student-archive-storage-precommit"] },
    { name: "Research deep_research student archive storage commit audit", command: npmCommand(), args: ["run", "audit:research-deep-research-student-archive-storage-commit"] },
    { name: "Research deep_research student archive row verification audit", command: npmCommand(), args: ["run", "audit:research-deep-research-student-archive-row-verification"] },
    { name: "workflow plugin flow audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-flow"] },
    { name: "workflow plugin registry admission", command: npmCommand(), args: ["run", "audit:workflow-plugin-registry"] },
    { name: "workflow plugin revision feedback", command: npmCommand(), args: ["run", "audit:workflow-plugin-revision"] },
    { name: "workflow plugin runtime SLO audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-runtime-slo"] },
    { name: "Workflow plugin draft intent runtime audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-draft-intent"] },
    { name: "Workflow plugin sandbox result runtime audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-sandbox-result"] },
    { name: "Workflow plugin human approval runtime audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-human-approval"] },
    { name: "Workflow plugin registry admission runtime audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-registry-admission-runtime"] },
    { name: "Workflow plugin execution isolation runtime audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-execution-isolation"] },
    { name: "Workflow plugin publication disabled runtime audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-publication-disabled"] },
    { name: "Workflow plugin management disabled view audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-management-disabled-view"] },
    { name: "Workflow plugin management audit detail audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-management-audit-detail"] },
    { name: "Workflow plugin management read-only list audit", command: npmCommand(), args: ["run", "audit:workflow-plugin-management-readonly-list"] },
    { name: "AI worker job contract audit", command: npmCommand(), args: ["run", "audit:ai-worker-job"] },
    { name: "knowledge access policy audit", command: npmCommand(), args: ["run", "audit:knowledge-policy"] },
    { name: "AI worker job admission audit", command: npmCommand(), args: ["run", "audit:ai-worker-job-admission"] },
    { name: "knowledge retrieval benchmark audit", command: npmCommand(), args: ["run", "audit:knowledge-retrieval-benchmark"] },
    { name: "ResearchAgent read-only runtime SLO audit", command: npmCommand(), args: ["run", "audit:research-agent-readonly-runtime-slo"] },
    { name: "Agent read-only runtime dispatcher audit", command: npmCommand(), args: ["run", "audit:agent-readonly-runtime-dispatcher"] },
    { name: "Agent read-only API runtime audit", command: npmCommand(), args: ["run", "audit:agent-readonly-api-runtime"] },
    { name: "Agent controlled write-intent gateway audit", command: npmCommand(), args: ["run", "audit:agent-controlled-write-intent-gateway"] },
    { name: "Teaching quiz draft intent runtime audit", command: npmCommand(), args: ["run", "audit:teaching-quiz-draft-intent"] },
    { name: "Teaching archive material draft intent runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-draft-intent"] },
    { name: "Teaching archive material draft human review runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-draft-human-review"] },
    { name: "Teaching archive material draft storage precommit runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-draft-storage-precommit"] },
    { name: "Teaching archive material draft storage commit runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-draft-storage-commit"] },
    { name: "Teaching archive material draft storage row verification runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-draft-storage-row-verification"] },
    { name: "Teaching archive material draft student product read runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-draft-student-product-read"] },
    { name: "Teaching archive material publication precheck runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-publication-precheck"] },
    { name: "Teaching archive material publication approval runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-publication-approval"] },
    { name: "Teaching archive material publication delivery runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-publication-delivery"] },
    { name: "Teaching archive material publication persistence command runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-publication-persistence-command"] },
    { name: "Teaching archive material publication storage commit runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-publication-storage-commit"] },
    { name: "Teaching archive material publication row verification runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-publication-row-verification"] },
    { name: "Teaching archive material publication student app read runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-publication-student-app-read"] },
    { name: "Teaching archive material publication projection hardening runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-publication-projection-hardening"] },
    { name: "Teaching archive material published search foundation runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-published-search-foundation"] },
    { name: "Teaching archive material published detail metadata read runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-published-detail-metadata-read"] },
    { name: "Teaching archive material published content preview precheck runtime audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-published-content-preview-precheck"] },
    { name: "Teaching archive material published content preview read foundation audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-published-content-preview-read-foundation"] },
    { name: "Teaching archive material published content preview render envelope audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-published-content-preview-render-envelope"] },
    { name: "Teaching archive material published study packet audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-published-study-packet"] },
    { name: "Teaching archive material published learning actions audit", command: npmCommand(), args: ["run", "audit:teaching-archive-material-published-learning-actions"] },
    { name: "AI worker runtime dependency audit", command: npmCommand(), args: ["run", "audit:ai-worker-runtime-dependencies"] },
    { name: "pgbouncer current performance profile audit", command: npmCommand(), args: ["run", "audit:pgbouncer-perf:current"] },
    { name: "conversation fanout decision audit", command: npmCommand(), args: ["run", "audit:conversation-fanout-decision"] },
    { name: "conversation client trace attribution audit", command: npmCommand(), args: ["run", "audit:conversation-client-trace-attribution"] },
    { name: "conversation transport profile decision audit", command: npmCommand(), args: ["run", "audit:conversation-transport-profile"] },
    { name: "conversation loadgen runtime decision audit", command: npmCommand(), args: ["run", "audit:conversation-loadgen-runtime"] },
    { name: "root workflow coverage audit", command: npmCommand(), args: ["run", "audit:root-workflow-coverage"] },
    { name: "cross-module DB/queue diagnostics audit", command: npmCommand(), args: ["run", "audit:cross-module-db-queue"] },
    { name: "pgbouncer production headroom audit", command: npmCommand(), args: ["run", "audit:pgbouncer-production-headroom"] },
    { name: "root SLO promotion review audit", command: npmCommand(), args: ["run", "audit:root-slo-promotion-review"] },
    { name: "system capacity claim audit", command: npmCommand(), args: ["run", "audit:system-capacity-claim"] },
    { name: "performance evidence registry audit", command: npmCommand(), args: ["run", "audit:performance-evidence"] },
    { name: "direct-limited connection budget", command: npmCommand(), args: ["run", "budget:connections:direct-limited"] },
    { name: "pgbouncer connection budget", command: npmCommand(), args: ["run", "budget:connections:pgbouncer"] },
    { name: "npm test", command: npmCommand(), args: ["test"] },
  ];
}

export function collectSourceFiles(root) {
  const files = [];
  for (const sourceRoot of sourceRoots) {
    const absolute = path.join(root, sourceRoot);
    if (!fs.existsSync(absolute)) continue;
    collectSourceFile(absolute, root, files);
  }
  return files;
}

export function runStaticQualityChecks(root) {
  const files = collectSourceFiles(root);
  const findings = [
    ...checkFileSizeThreshold(files),
    ...checkGoFormatting(root),
    ...checkRustFormatting(root),
    ...checkNoRuntimeTodoMarkers(files),
    ...checkArchitectureBoundaries(files),
  ];
  return {
    passed: findings.length === 0,
    findings,
  };
}

function checkGoFormatting(root) {
  const result = spawnSync("gofmt", ["-l", ...goServiceDirs], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    return [{
      id: "source.gofmt",
      path: "",
      passed: false,
      message: `gofmt check failed: ${result.error.message}`,
    }];
  }
  return checkGoFormatOutput(result.stdout ?? "");
}

function checkRustFormatting(root) {
  const manifest = path.join(root, "services", "agent-harness", "Cargo.toml");
  if (!fs.existsSync(manifest)) return [];
  const result = spawnSync("cargo", ["fmt", "--manifest-path", "services/agent-harness/Cargo.toml", "--", "--check"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  return checkRustFormatResult(result);
}

export function runQualityGate(root, options = {}) {
  const reportPath = options.reportPath ?? defaultReportPath;
  const plan = options.plan ?? buildQualityCommandPlan();
  const startedAt = options.startedAt ?? Date.now();
  const staticChecks = options.staticChecks ?? runStaticQualityChecks(root);
  const commandResults = [];

  if (staticChecks.passed) {
    writeReport(root, reportPath, buildInProgressQualityReport({
      startedAt,
      staticChecks,
      plan,
    }));
    commandResults.push(...runQualityCommands(root, plan, { allowInProgressQualityReport: true }));
  }

  const allPassed = staticChecks.passed && commandResults.every((result) => result.passed);
  const report = {
    generatedAt: new Date().toISOString(),
    status: allPassed ? "PASSED" : "FAILED",
    allPassed,
    elapsedMs: Date.now() - startedAt,
    staticChecks,
    commandResults,
  };
  writeReport(root, reportPath, report);
  return report;
}

export function runQualityCommands(root, plan = buildQualityCommandPlan(), options = {}) {
  const results = [];
  for (const step of plan) {
    const startedAt = Date.now();
    const runnable = toRunnableCommand(step);
    const result = spawnSync(runnable.command, runnable.args, {
      cwd: root,
      env: commandEnvironment(options),
      stdio: "inherit",
      shell: false,
    });
    results.push({
      name: step.name,
      passed: result.status === 0 && !result.error,
      exitCode: result.status ?? 1,
      elapsedMs: Date.now() - startedAt,
      error: result.error?.message,
    });
  }
  return results;
}

export function buildInProgressQualityReport({ startedAt = Date.now(), staticChecks, plan }) {
  return {
    generatedAt: new Date().toISOString(),
    status: inProgressStatus,
    allPassed: false,
    elapsedMs: Date.now() - startedAt,
    staticChecks,
    commandResults: [],
    pendingCommands: plan.map((step) => step.name),
  };
}

function collectSourceFile(absolute, root, files) {
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    const name = path.basename(absolute);
    if (["node_modules", ".git", "reports", "dist", "build", "target"].includes(name)) return;
    for (const child of fs.readdirSync(absolute)) {
      collectSourceFile(path.join(absolute, child), root, files);
    }
    return;
  }
  if (!stat.isFile() || !sourceExtensions.has(path.extname(absolute))) return;
  files.push({
    path: normalizePath(path.relative(root, absolute)),
    text: fs.readFileSync(absolute, "utf8"),
  });
}

function isRuntimeSource(filePath) {
  if (!filePath.startsWith("services/")) return false;
  if (filePath.endsWith("_test.go") || filePath.endsWith(".test.mjs")) return false;
  return filePath.endsWith(".go") || filePath.endsWith(".mjs") || filePath.endsWith(".rs");
}

function isInnerLayerFile(filePath) {
  return filePath.includes("/internal/domain/") || filePath.includes("/internal/usecase/");
}

function isForbiddenInnerImport(importPath) {
  return [
    importPath === "net/http",
    importPath === "database/sql",
    importPath.includes("/internal/adapter/"),
    importPath.includes("/cmd/"),
    importPath.startsWith("github.com/jackc/pgx"),
    importPath.toLowerCase().includes("redis"),
  ].some(Boolean);
}

function extractGoImports(text) {
  const imports = [];
  const singleImport = text.matchAll(/import\s+"([^"]+)"/g);
  for (const match of singleImport) imports.push(match[1]);

  const importBlocks = text.matchAll(/import\s*\(([\s\S]*?)\)/g);
  for (const block of importBlocks) {
    for (const match of block[1].matchAll(/"([^"]+)"/g)) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function countLines(text) {
  if (text.length === 0) return 0;
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

function npmCommand() {
  return "npm";
}

function toRunnableCommand(step) {
  if (process.platform === "win32" && step.command === "npm") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", ["npm", ...step.args].join(" ")],
    };
  }
  return step;
}

function commandEnvironment(options) {
  if (options.allowInProgressQualityReport !== true) return process.env;
  return {
    ...process.env,
    [qualityGateInProgressEnv]: "1",
  };
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function writeReport(root, reportPath, report) {
  const absolute = path.join(root, reportPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  return {
    out: outIndex === -1 ? defaultReportPath : argv[outIndex + 1],
  };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const report = runQualityGate(root, { reportPath: args.out });

  for (const finding of report.staticChecks.findings) {
    console.error(`[FAIL] ${finding.message}`);
  }

  for (const result of report.commandResults) {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`[${status}] ${result.name} (${result.elapsedMs}ms)`);
  }
  console.log(`[summary] ${args.out}`);
  process.exit(report.allPassed ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
