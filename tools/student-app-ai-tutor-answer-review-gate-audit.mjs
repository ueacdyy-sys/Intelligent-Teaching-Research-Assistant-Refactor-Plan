import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT,
  STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID,
  recordStudentAppAITutorAnswerReviewGate,
} from "./student-app-ai-tutor-answer-review-gate-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-answer-review-gate.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-answer-review-gate-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-answer-review-gate-runtime.test.mjs",
  controlledAnswerArtifactReport: "reports/student-app-ai-tutor-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  sdd: "docs/sdd/0326-student-app-ai-tutor-answer-review-gate.md",
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
  "guidanceTextSentToPort: true",
  "resultPersistenceStarted: true",
  "tutoringResultRecorded: true",
  "studentVisiblePublished: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "externalToolUseAllowed: true",
  "retrievalAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorAnswerReviewGate(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const controlledAnswerArtifactReport = parseJson(inputs.controlledAnswerArtifactReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.rootTrace ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(controlledAnswerArtifactReport, options);

  addFinding(findings, {
    id: "source.0325_controlled_answer_artifact_ready",
    passed: controlledAnswerArtifactReport.readiness === "READY" &&
      controlledAnswerArtifactReport.workloadType === "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT" &&
      controlledAnswerArtifactReport.runtime?.runtimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" &&
      controlledAnswerArtifactReport.runtime?.status === "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT_RECORDED" &&
      controlledAnswerArtifactReport.runtimeSlo?.totalErrors === 0 &&
      controlledAnswerArtifactReport.safetyInvariants?.humanReviewRequiredBeforeResult === true &&
      controlledAnswerArtifactReport.safetyInvariants?.studentVisiblePublished === false,
    actual: `${controlledAnswerArtifactReport.readiness ?? "missing"}:${controlledAnswerArtifactReport.runtime?.status ?? "missing"}`,
    expected: "READY 0325 controlled answer artifact with student visibility blocked",
    remediation: "Run the 0325 controlled answer artifact audit before answer review gate recording.",
  });

  addFinding(findings, {
    id: "runtime.identity_review_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT",
      "StudentAppAITutorAnswerReviewGatePort.recordAnswerReviewGate",
      "recordStudentAppAITutorAnswerReviewGate",
      "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RECORDED",
      "assertReviewerPrincipal",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_answer_review_gate_runtime",
      "StudentAppAITutorAnswerReviewGatePort.recordAnswerReviewGate",
      "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RECORDED",
    ]),
    expected: "runtime records an idempotent human review gate through a named injected port",
    remediation: "Keep answer review as a replay-safe human gate before result persistence.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "controlledAnswerArtifactRequired: true",
      "humanReviewCompleted: true",
      "answerReviewGateRecorded: true",
      "guidanceTextSentToPort: false",
      "resultPersistenceStarted: false",
      "tutoringResultRecorded: false",
      "studentVisiblePublished: false",
      "rawModelOutputExcluded: true",
      "promptExcluded: true",
      "answerKeyExcluded: true",
      "contentRefExcluded: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "externalToolUseAllowed: false",
      "retrievalAllowed: false",
      "swarmAllowed: false",
      "futureResultPersistenceRequiresSeparateRuntime: true",
      "futureStudentVisibilityRequiresSeparateRuntime: true",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime records review metadata only and blocks guidance text to port, result persistence, publication, DB, HTTP, tools, retrieval, and Swarm",
    remediation: "Do not collapse answer review into result persistence or student-visible delivery.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_human_review_gate",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT &&
      probe.result?.answerReviewGate?.decision === "APPROVE_FOR_RESULT_PERSISTENCE" &&
      probe.result?.boundary?.guidanceTextSentToPort === false &&
      probe.result?.boundary?.tutoringResultRecorded === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};decision=${probe.result.answerReviewGate.decision};textToPort=${probe.portSawGuidanceText};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one human review gate without guidance text leakage, result persistence, or student visibility",
    remediation: "Answer review evidence must prove 0325 linkage, human reviewer, metadata-only port request, and no result write.",
  });

  addFinding(findings, {
    id: "tests.cover_answer_review_gate_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a human review gate without result persistence or student visibility",
      "uses idempotency for safe replay and rejects conflicting review gates",
      "rejects missing ports, unsafe reviewers, and unsafe source reports",
      "rejects leaked fields and unsafe review decisions",
      "rejects unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, missing port, reviewer auth, source, leak, unsafe review, and unsafe port tests",
    remediation: "Add regression coverage before using 0326 as answer review gate evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-answer-review-gate"]?.includes("student-app-ai-tutor-answer-review-gate-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor answer review gate runtime audit",
        "studentAppAiTutorAnswerReviewGate",
        "student-app-ai-tutor-answer-review-gate.current.json",
        "student_app_ai_tutor_answer_review_gate_runtime",
        "0326-student-app-ai-tutor-answer-review-gate.md",
        "11.14/10",
        "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RECORDED",
        "SDD 0326 student app ai tutor answer review gate",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-answer-review-gate",
      "studentAppAiTutorAnswerReviewGate",
      "11.14/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0326",
    remediation: "Wire answer review gate evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT,
      sourceRuntimes: ["student_app_ai_tutor_controlled_answer_artifact_runtime"],
      status: "STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorAnswerReviewGate: probe },
    safetyInvariants: {
      controlledAnswerArtifactRequired: true,
      humanReviewCompleted: true,
      answerReviewGateRecorded: true,
      guidanceTextSentToPort: false,
      resultPersistenceStarted: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      contentRefExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the AI Tutor answer human-review gate; result persistence and student-visible delivery remain separate future slices."
      : "Fix answer review gate evidence before persisting or showing AI Tutor answers.",
  };
}

export function formatStudentAppAITutorAnswerReviewGateAudit(report) {
  const lines = [
    `Student App AI Tutor answer review gate runtime: ${report.readiness}`,
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

async function runRuntimeProbe(controlledAnswerArtifactReport, options = {}) {
  const reviewLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-answer-review-gate-audit-")), "review.jsonl");
  let portCalls = 0;
  let portSawGuidanceText = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorAnswerReviewGate(probeInput(controlledAnswerArtifactReport), {
      generatedAt: "2026-06-08T09:10:00.000Z",
      reviewLogPath,
      answerReviewGatePort: {
        async recordAnswerReviewGate(request) {
          portCalls += 1;
          portSawGuidanceText = JSON.stringify(request).includes("Convert both fractions");
          return {
            answerReviewGate: {
              reviewId: "ai_tutor_answer_review_gate_001",
              artifactId: request.artifactId,
              requestId: request.requestId,
              workerId: request.workerId,
              precheckId: request.precheckId,
              queueRef: request.queueRef,
              reviewerPrincipalId: request.reviewerPrincipalId,
              decision: request.decision,
              guidanceSectionsHash: request.guidanceSectionsHash,
              status: "AI_TUTOR_ANSWER_REVIEW_APPROVED_NOT_PERSISTED",
              resultPersistenceStarted: false,
              tutoringResultRecorded: false,
              studentVisiblePublished: false,
            },
          };
        },
      },
    });
    return {
      status: "PASS",
      result,
      portCalls,
      portSawGuidanceText,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Date.now() - startedAt),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "JS_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, portCalls, portSawGuidanceText, runtimeSlo: failedSlo() };
  }
}

function probeInput(controlledAnswerArtifactReport) {
  const result = controlledAnswerArtifactReport.runtimeProbes?.studentAppAiTutorControlledAnswerArtifact?.result ?? {};
  const artifact = result.controlledAnswerArtifact ?? {};
  const guidanceSectionsHash = hashGuidanceSections(artifact.guidanceSections ?? []);
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-answer-review-gate.v1",
    reviewInvocationId: "ai_tutor_answer_review_001",
    controlledAnswerArtifactReport,
    principal: {
      principalId: "teacher_reviewer_001",
      subjectType: "USER",
      role: "TEACHER",
      entryPoint: "DESKTOP_TEACHER",
      sessionId: "teacher_session_001",
      scopes: ["TEACHING_READ", "TEACHING_WRITE"],
    },
    reviewDecision: {
      artifactId: artifact.artifactId,
      requestId: result.requestId,
      workerId: result.workerId,
      precheckId: result.precheckId,
      queueRef: result.queueRef,
      decision: "APPROVE_FOR_RESULT_PERSISTENCE",
      guidanceSectionsHash,
      reviewerNotes: "Guidance is learner-safe and ready for the next controlled persistence slice.",
      reviewChecklist: {
        sourceArtifactVerified: true,
        guidanceSafeForLearner: true,
        rawModelOutputAbsent: true,
        promptAbsent: true,
        answerKeyAbsent: true,
        resultPersistenceRequiresSeparateRuntime: true,
        studentVisibilityRequiresSeparateRuntime: true,
      },
      reviewedAt: "2026-06-08T09:10:00.000Z",
    },
    evidenceRefs: [
      "evidence:controlled-answer-artifact:student-app-ai-tutor-controlled-answer-artifact",
      "evidence:answer-review-gate:teacher-human-review",
    ],
    idempotencyKey: `student-app-ai-tutor-answer-review-gate:${artifact.artifactId ?? "missing"}`,
  };
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.severity ?? "info", ...finding });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function stringifyScalar(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 1, evidenceClass: "JS_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_PROBE" };
}

function hashGuidanceSections(sections) {
  const metadata = sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    textHash: hashInput(section.text),
    sourceBlockRefs: section.sourceBlockRefs,
  }));
  return hashInput(metadata);
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : defaultOutPath;
  const report = await auditStudentAppAITutorAnswerReviewGate();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorAnswerReviewGateAudit(report));
  if (report.readiness !== "READY") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
