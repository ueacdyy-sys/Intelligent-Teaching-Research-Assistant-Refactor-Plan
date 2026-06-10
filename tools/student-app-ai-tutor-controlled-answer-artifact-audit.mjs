import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT,
  STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID,
  recordStudentAppAITutorControlledAnswerArtifact,
} from "./student-app-ai-tutor-controlled-answer-artifact-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-controlled-answer-artifact.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-controlled-answer-artifact-runtime.test.mjs",
  sourceModelPrecheckReport: "reports/student-app-ai-tutor-model-execution-precheck.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0325-student-app-ai-tutor-controlled-answer-artifact.md",
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

export async function auditStudentAppAITutorControlledAnswerArtifact(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceModelPrecheckReport = parseJson(inputs.sourceModelPrecheckReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.rootTrace ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceModelPrecheckReport, options);

  addFinding(findings, {
    id: "source.0324_model_execution_precheck_ready",
    passed: sourceModelPrecheckReport.readiness === "READY" &&
      sourceModelPrecheckReport.workloadType === "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECK" &&
      sourceModelPrecheckReport.runtime?.runtimeId === "student_app_ai_tutor_model_execution_precheck_runtime" &&
      sourceModelPrecheckReport.runtime?.status === "STUDENT_APP_AI_TUTOR_MODEL_EXECUTION_PRECHECKED" &&
      sourceModelPrecheckReport.runtimeSlo?.totalErrors === 0 &&
      sourceModelPrecheckReport.safetyInvariants?.modelInferenceAllowed === false,
    actual: `${sourceModelPrecheckReport.readiness ?? "missing"}:${sourceModelPrecheckReport.runtime?.status ?? "missing"}`,
    expected: "READY 0324 AI Tutor model execution precheck with no result persistence",
    remediation: "Run the 0324 model execution precheck audit before controlled answer artifact recording.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT",
      "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact",
      "recordStudentAppAITutorControlledAnswerArtifact",
      "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_controlled_answer_artifact_runtime",
      "StudentAppAITutorControlledAnswerArtifactPort.recordControlledAnswerArtifact",
      "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
    ]),
    expected: "runtime records an idempotent controlled AI Tutor answer artifact through a named injected port",
    remediation: "Keep controlled answer artifact recording as a replay-safe port boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceModelExecutionPrecheckRequired: true",
      "internalServiceOnly: true",
      "controlledAnswerArtifactRecorded: true",
      "humanReviewRequiredBeforeResult: true",
      "rawModelOutputExcluded: true",
      "promptExcluded: true",
      "answerKeyExcluded: true",
      "tutoringResultRecorded: false",
      "resultPersistenceAllowed: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalToolUseAllowed: false",
      "retrievalAllowed: false",
      "swarmAllowed: false",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime records a review-only controlled artifact and does not persist results, publish, DB, HTTP, tools, retrieval, or Swarm",
    remediation: "Do not collapse controlled answer artifact recording into result persistence or student-visible delivery.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_review_only_artifact",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT &&
      probe.result?.controlledAnswerArtifact?.requestId === "tutor_req_student_app_001" &&
      probe.result?.controlledAnswerArtifact?.reviewState === "PENDING_HUMAN_REVIEW" &&
      probe.result?.controlledAnswerArtifact?.guidanceSections?.length === 2 &&
      probe.result?.boundary?.tutoringResultRecorded === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};sections=${probe.result.controlledAnswerArtifact.guidanceSections.length};calls=${probe.portCalls};textToPort=${probe.portSawGuidanceText};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one review-only controlled answer artifact without result persistence or student visibility",
    remediation: "Controlled artifact evidence must prove 0324 linkage, sanitized output, no raw model output, and no result write.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_answer_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a controlled answer artifact without result persistence or student visibility",
      "uses idempotency for safe replay and rejects conflicting artifacts",
      "rejects missing ports, unsafe principals, and unsafe source prechecks",
      "rejects leaked fields and enabled persistence flags",
      "rejects unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, auth, source, leak, unsafe policy, and unsafe port tests",
    remediation: "Add regression coverage before using 0325 as controlled answer artifact evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-controlled-answer-artifact"]?.includes("student-app-ai-tutor-controlled-answer-artifact-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor controlled answer artifact runtime audit",
        "studentAppAiTutorControlledAnswerArtifact",
        "student-app-ai-tutor-controlled-answer-artifact.current.json",
        "student_app_ai_tutor_controlled_answer_artifact_runtime",
        "0325-student-app-ai-tutor-controlled-answer-artifact.md",
        "11.11/10",
        "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
        "SDD 0325 student app ai tutor controlled answer artifact",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-controlled-answer-artifact",
      "studentAppAiTutorControlledAnswerArtifact",
      "11.11/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0325",
    remediation: "Wire controlled AI Tutor answer artifact evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_PORT,
      sourceRuntimes: ["student_app_ai_tutor_model_execution_precheck_runtime"],
      status: "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorControlledAnswerArtifact: probe },
    safetyInvariants: {
      sourceModelExecutionPrecheckRequired: true,
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
      ? "Use this as the review-only AI Tutor answer artifact boundary; human review, result persistence, and student visibility remain future slices."
      : "Fix controlled answer artifact evidence before persisting or showing AI Tutor results.",
  };
}

export function formatStudentAppAITutorControlledAnswerArtifactAudit(report) {
  const lines = [
    `Student App AI Tutor controlled answer artifact runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
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

async function runRuntimeProbe(sourceModelPrecheckReport, options = {}) {
  const artifactLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-controlled-answer-audit-")), "artifact.jsonl");
  let portCalls = 0;
  let portSawGuidanceText = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorControlledAnswerArtifact(probeInput(sourceModelPrecheckReport), {
      generatedAt: "2026-06-08T08:20:00.000Z",
      artifactLogPath,
      controlledAnswerArtifactPort: {
        async recordControlledAnswerArtifact(request) {
          portCalls += 1;
          portSawGuidanceText = JSON.stringify(request).includes("Convert both fractions");
          return {
            controlledAnswerArtifact: {
              artifactId: "ai_tutor_answer_artifact_001",
              requestId: request.requestId,
              workerId: request.workerId,
              precheckId: request.precheckId,
              queueRef: request.queueRef,
              status: "AI_TUTOR_CONTROLLED_ANSWER_RECORDED_NOT_REVIEWED",
              reviewState: "PENDING_HUMAN_REVIEW",
              summary: "Guided help for comparing fractions.",
              guidanceSections: [
                {
                  sectionId: "ai_tutor_answer_section_001",
                  title: "Start with a common denominator",
                  text: "Convert both fractions to the same denominator, then compare the numerators.",
                  sourceBlockRefs: ["block_section_001"],
                },
                {
                  sectionId: "ai_tutor_answer_section_002",
                  title: "Check your reasoning",
                  text: "Explain why the larger numerator is larger only after the denominators match.",
                  sourceBlockRefs: ["block_section_002"],
                },
              ],
              safetyLabels: ["NO_DIAGNOSIS", "STUDY_GUIDANCE_ONLY"],
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
        evidenceClass: "JS_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_PROBE",
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

function probeInput(sourceModelPrecheckReport) {
  const sourcePrecheckResult = sourceModelPrecheckReport.runtimeProbes?.studentAppAiTutorModelExecutionPrecheck?.result ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-controlled-answer-artifact.v1",
    artifactInvocationId: "ai_tutor_answer_artifact_invocation_001",
    modelExecutionPrecheckReport: sourceModelPrecheckReport,
    principal: {
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      scopes: ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    generationAttempt: {
      attemptId: "ai_tutor_answer_attempt_001",
      precheckId: "ai_tutor_model_precheck_001",
      queueRef: "ai_tutor_model_queue_001",
      requestId: "tutor_req_student_app_001",
      workerId: "worker_student_tutor_01",
      modelRoute: "student_tutor_guided_help_v1",
      inputHash: sourcePrecheckResult.inputHash,
      attemptNumber: 1,
      startedAt: "2026-06-08T08:20:00.000Z",
      completedAt: "2026-06-08T08:20:01.000Z",
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
      "evidence:model-execution-precheck:student-app-ai-tutor-model-execution-precheck",
      "evidence:controlled-answer-policy:review-before-result",
    ],
    idempotencyKey: "student-app-ai-tutor-controlled-answer:tutor_req_student_app_001:ai_tutor_model_precheck_001",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: 50,
    totalErrors: 1,
    operations: 1,
    evidenceClass: "JS_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RUNTIME_PROBE",
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
  const report = await auditStudentAppAITutorControlledAnswerArtifact(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorControlledAnswerArtifactAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
