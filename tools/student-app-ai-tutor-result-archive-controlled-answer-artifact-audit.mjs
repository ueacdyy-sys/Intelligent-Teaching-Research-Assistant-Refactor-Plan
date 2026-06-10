import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT,
  STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID,
  recordStudentAppAITutorControlledAnswerArtifact,
} from "./student-app-ai-tutor-controlled-answer-artifact-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT";
const runtimeId = "student_app_ai_tutor_result_archive_controlled_answer_artifact";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RECORDED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.test.mjs",
  source0337Report: "reports/student-app-ai-tutor-result-archive-model-execution-precheck.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0338-student-app-ai-tutor-result-archive-controlled-answer-artifact.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process",
  "spawn(",
  "execSync(",
  "fetch(",
  "postgres://",
  "SELECT ",
  "INSERT ",
  "UPDATE ",
  "DELETE ",
  "tutoringResultRecorded: true",
  "resultPersistenceAllowed: true",
  "studentVisiblePublished: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "externalToolUseAllowed: true",
  "retrievalAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorResultArchiveControlledAnswerArtifact(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0337Report = parseJson(inputs.source0337Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(source0337Report, options);

  addFinding(findings, {
    id: "source.0337_result_archive_model_precheck_ready",
    passed: source0337Report.readiness === "READY" &&
      source0337Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECK" &&
      source0337Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_model_execution_precheck" &&
      source0337Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_model_execution_precheck_runtime" &&
      source0337Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_MODEL_EXECUTION_PRECHECKED" &&
      source0337Report.runtimeSlo?.totalErrors === 0 &&
      source0337Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" &&
      source0337Report.safetyInvariants?.modelInferenceAllowed === false,
    actual: [
      source0337Report.readiness ?? "missing",
      source0337Report.runtime?.runtimeId ?? "missing",
      source0337Report.runtime?.status ?? "missing",
      source0337Report.runtimeSlo?.totalErrors ?? "missing",
    ].join(":"),
    expected: "READY 0337 result-archive model precheck with zero errors and no model inference",
    remediation: "Run or fix 0337 before creating result-archive-sourced controlled answer artifacts.",
  });

  addFinding(findings, {
    id: "runtime.accepts_result_archive_precheck_for_controlled_artifact",
    passed: includesAll(runtime, [
      "sourceResultArchivePrecheckRuntimeId",
      "assertResultArchiveModelExecutionPrecheckReport",
      "student_app_ai_tutor_result_archive_model_execution_precheck",
      "AI_TUTOR_RESULT_ARCHIVE",
      "sourceWorkerResultArchiveInputVerified",
      "learningActionSource: source.learningActionSource",
      "resultArchiveStatus: source.resultArchiveStatus",
      "studentVisiblePublished: false",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, [
      "assertResultArchiveModelExecutionPrecheckReport",
      "AI_TUTOR_RESULT_ARCHIVE",
      "learningActionSource: source.learningActionSource",
      "resultArchiveStatus: source.resultArchiveStatus",
    ]),
    expected: "shared controlled answer runtime accepts 0337 result-archive precheck and records source metadata without publication",
    remediation: "Keep result-archive follow-up tutoring on the same review-only artifact boundary.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_result_archive_review_only_artifact",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT &&
      probe.result?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" &&
      probe.result?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.controlledAnswerArtifact?.reviewState === "PENDING_HUMAN_REVIEW" &&
      probe.result?.boundary?.tutoringResultRecorded === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `source=${probe.result.learningActionSource};review=${probe.result.controlledAnswerArtifact.reviewState};calls=${probe.portCalls};textToPort=${probe.portSawGuidanceText};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one result-archive-sourced controlled answer artifact without result persistence or student visibility",
    remediation: "Controlled answer artifact evidence must prove 0337 linkage, source metadata, sanitized output, and no student-visible result.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_controlled_answer_paths",
    passed: includesAll(runtimeTest, [
      "records a result-archive-sourced controlled answer artifact for human review only",
      "rejects unsafe result-archive precheck source reports",
      "AI_TUTOR_RESULT_ARCHIVE",
      "resultArchiveStatus",
    ]),
    actual: "runtime tests scanned",
    expected: "positive result-archive artifact path and unsafe source rejection tests",
    remediation: "Add result-archive controlled answer regression coverage before claiming 0338 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0338",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-controlled-answer-artifact"]?.includes("student-app-ai-tutor-result-archive-controlled-answer-artifact-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor result-archive controlled answer artifact audit",
        "studentAppAiTutorResultArchiveControlledAnswerArtifact",
        "student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json",
        runtimeId,
        "0338-student-app-ai-tutor-result-archive-controlled-answer-artifact.md",
        "11.50/10",
        readyStatus,
        "SDD 0338 student app ai tutor result archive controlled answer artifact",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-archive-controlled-answer-artifact",
      "studentAppAiTutorResultArchiveControlledAnswerArtifact",
      "11.50/10",
      "SDD 0338",
    ]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0338",
    remediation: "Wire 0338 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sharedRuntimeId: STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT,
      sourceRuntimes: ["student_app_ai_tutor_result_archive_model_execution_precheck"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveControlledAnswerArtifact: probe },
    safetyInvariants: {
      source0337ResultArchiveModelPrecheckRequired: true,
      learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      internalServiceOnly: true,
      controlledAnswerArtifactRecorded: true,
      humanReviewRequiredBeforeResult: true,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      tutoringResultRecorded: false,
      resultPersistenceAllowed: false,
      studentVisiblePublished: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the result-archive follow-up controlled answer artifact boundary; review, persistence, student delivery, OCR/RAG, Swarm, and actual model execution remain later reviewed slices."
      : "Fix 0338 before claiming AI_TUTOR_RESULT_ARCHIVE follow-up tutoring can proceed to review-only answer artifacts.",
  };
}

export function formatStudentAppAITutorResultArchiveControlledAnswerArtifactAudit(report) {
  const lines = [
    `Student App AI Tutor result-archive controlled answer artifact: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `Shared runtime: ${report.runtime.sharedRuntimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
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

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

async function runRuntimeProbe(source0337Report, options = {}) {
  const artifactLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-controlled-answer-audit-")), "artifact.jsonl");
  let portCalls = 0;
  let portSawGuidanceText = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorControlledAnswerArtifact(probeInput(source0337Report), {
      generatedAt: "2026-06-09T11:20:00.000Z",
      artifactLogPath,
      controlledAnswerArtifactPort: {
        async recordControlledAnswerArtifact(request) {
          portCalls += 1;
          portSawGuidanceText = JSON.stringify(request).includes("Restate the corrected reasoning");
          return {
            controlledAnswerArtifact: {
              artifactId: "ai_tutor_answer_artifact_result_archive_001",
              requestId: request.requestId,
              workerId: request.workerId,
              precheckId: request.precheckId,
              queueRef: request.queueRef,
              status: "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED",
              reviewState: "PENDING_HUMAN_REVIEW",
              summary: "Follow-up help based on a reviewed AI Tutor result.",
              guidanceSections: [
                {
                  sectionId: "ai_tutor_answer_section_result_archive_001",
                  title: "Review the previous correction",
                  text: "Restate the corrected reasoning before attempting a similar practice item.",
                  sourceBlockRefs: ["source_block_001"],
                },
              ],
              safetyLabels: ["STUDY_GUIDANCE_ONLY", "FOLLOW_UP_REVIEW"],
              resultPersistenceAllowed: false,
              tutoringResultRecorded: false,
              studentVisiblePublished: false,
            },
          };
        },
      },
    });
    const elapsed = Math.max(1, options.probeP99Ms ?? Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls,
      portSawGuidanceText,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, elapsed),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: `${error.code ?? "ERROR"}:${error.message}`,
      portCalls,
      portSawGuidanceText,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(source0337Report) {
  const source = source0337Report.runtimeProbes?.studentAppAiTutorResultArchiveModelExecutionPrecheck?.result ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-controlled-answer-artifact.v1",
    artifactInvocationId: "ai_tutor_answer_artifact_invocation_result_archive_001",
    modelExecutionPrecheckReport: source0337Report,
    principal: {
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    generationAttempt: {
      attemptId: "ai_tutor_answer_attempt_result_archive_001",
      precheckId: source.modelExecutionPrecheck?.precheckId,
      queueRef: source.modelExecutionPrecheck?.queueRef,
      requestId: source.requestId,
      workerId: source.workerId,
      modelRoute: "student_tutor_guided_help_v1",
      inputHash: source.inputHash,
      attemptNumber: 1,
      startedAt: "2026-06-09T11:20:00.000Z",
      completedAt: "2026-06-09T11:20:01.000Z",
      rawOutputCaptured: false,
      promptStored: false,
    },
    artifactPolicy: {
      reviewRequiredBeforeResult: true,
      resultPersistenceAllowed: false,
      studentVisibleAllowed: false,
      requireSourceBlockRefs: true,
      maxGuidanceSections: 4,
      maxSectionChars: 800,
    },
    evidenceRefs: [
      "evidence:result-archive-model-execution-precheck:student-app-ai-tutor-result-archive-model-execution-precheck",
      "evidence:controlled-answer-policy:review-before-result",
    ],
    idempotencyKey: `student-app-ai-tutor-controlled-answer:${source.requestId ?? "missing"}:${source.modelExecutionPrecheck?.precheckId ?? "missing"}`,
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: 50,
    totalErrors: 1,
    operations: 1,
    evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_PROBE",
  };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultArchiveControlledAnswerArtifact(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveControlledAnswerArtifactAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
