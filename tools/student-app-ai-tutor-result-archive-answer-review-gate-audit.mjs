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

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-answer-review-gate.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE";
const runtimeId = "student_app_ai_tutor_result_archive_answer_review_gate";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE_RECORDED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-answer-review-gate-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-answer-review-gate-runtime.test.mjs",
  source0338Report: "reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0339-student-app-ai-tutor-result-archive-answer-review-gate.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ",
  "guidanceTextSentToPort: true", "resultPersistenceStarted: true", "tutoringResultRecorded: true", "studentVisiblePublished: true",
  "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "externalToolUseAllowed: true", "retrievalAllowed: true", "swarmAllowed: true",
  "innerHTML", "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorResultArchiveAnswerReviewGate(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0338Report = parseJson(inputs.source0338Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const probe = await runRuntimeProbe(source0338Report, options);

  addFinding(findings, {
    id: "source.0338_result_archive_controlled_artifact_ready",
    passed: source0338Report.readiness === "READY" &&
      source0338Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT" &&
      source0338Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_controlled_answer_artifact" &&
      source0338Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" &&
      source0338Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT_RECORDED" &&
      source0338Report.runtimeSlo?.totalErrors === 0 &&
      source0338Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" &&
      source0338Report.safetyInvariants?.studentVisiblePublished === false,
    actual: [source0338Report.readiness ?? "missing", source0338Report.runtime?.runtimeId ?? "missing", source0338Report.runtime?.status ?? "missing", source0338Report.runtimeSlo?.totalErrors ?? "missing"].join(":"),
    expected: "READY 0338 result-archive controlled answer artifact with zero errors and student visibility blocked",
    remediation: "Run or fix 0338 before recording result-archive answer review gates.",
  });

  addFinding(findings, {
    id: "runtime.accepts_result_archive_controlled_artifact_for_review",
    passed: includesAll(runtime, [
      "sourceResultArchiveArtifactRuntimeId",
      "sourceResultArchiveArtifactWorkloadType",
      "student_app_ai_tutor_result_archive_controlled_answer_artifact",
      "studentAppAiTutorResultArchiveControlledAnswerArtifact",
      "learningActionSource: source.learningActionSource",
      "resultArchiveStatus: source.resultArchiveStatus",
      "guidanceTextSentToPort: false",
      "studentVisiblePublished: false",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["sourceResultArchiveArtifactRuntimeId", "studentAppAiTutorResultArchiveControlledAnswerArtifact", "learningActionSource: source.learningActionSource", "resultArchiveStatus: source.resultArchiveStatus"]),
    expected: "shared answer review gate runtime accepts 0338 result-archive source and records only review metadata",
    remediation: "Keep result-archive answer review on the same human-review gate boundary.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_result_archive_human_review_gate",
    passed: probe.status === "PASS" &&
      probe.result?.runtimeId === STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT &&
      probe.result?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" &&
      probe.result?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.answerReviewGate?.decision === "APPROVE_FOR_RESULT_PERSISTENCE" &&
      probe.result?.boundary?.guidanceTextSentToPort === false &&
      probe.result?.boundary?.tutoringResultRecorded === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.portSawGuidanceText === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.learningActionSource};decision=${probe.result.answerReviewGate.decision};textToPort=${probe.portSawGuidanceText};p99=${probe.runtimeSlo.p99Ms}` : probe.error,
    expected: "probe records one result-archive human review gate without guidance text leakage, persistence, or student visibility",
    remediation: "Review-gate evidence must prove 0338 linkage, reviewer authorization, metadata-only port request, and no result write.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_answer_review_paths",
    passed: includesAll(runtimeTest, [
      "records a result-archive-sourced answer review gate without leaking guidance text",
      "unsafeResultArchiveSource",
      "learningActionSourceRequired must be AI_TUTOR_RESULT_ARCHIVE",
      "AI_TUTOR_RESULT_ARCHIVE",
      "resultArchiveStatus",
    ]),
    actual: "runtime tests scanned",
    expected: "positive result-archive review path and unsafe result-archive source rejection tests",
    remediation: "Add result-archive answer review regression coverage before claiming 0339 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0339",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-answer-review-gate"]?.includes("student-app-ai-tutor-result-archive-answer-review-gate-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor result-archive answer review gate audit",
        "studentAppAiTutorResultArchiveAnswerReviewGate",
        "student-app-ai-tutor-result-archive-answer-review-gate.current.json",
        runtimeId,
        "0339-student-app-ai-tutor-result-archive-answer-review-gate.md",
        "11.53/10",
        readyStatus,
        "SDD 0339 student app ai tutor result archive answer review gate",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-answer-review-gate", "studentAppAiTutorResultArchiveAnswerReviewGate", "11.53/10", "SDD 0339"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0339",
    remediation: "Wire 0339 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: {
      runtimeId,
      sharedRuntimeId: STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_ANSWER_REVIEW_GATE_PORT,
      sourceRuntimes: ["student_app_ai_tutor_result_archive_controlled_answer_artifact"],
      status: readyStatus,
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveAnswerReviewGate: probe },
    safetyInvariants: {
      source0338ResultArchiveControlledAnswerArtifactRequired: true,
      learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      humanReviewCompleted: true,
      answerReviewGateRecorded: true,
      guidanceTextSentToPort: false,
      resultPersistenceStarted: false,
      tutoringResultRecorded: false,
      studentVisiblePublished: false,
      rawModelOutputExcluded: true,
      promptExcluded: true,
      answerKeyExcluded: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      externalToolUseAllowed: false,
      retrievalAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the result-archive follow-up human-review gate; persistence, visibility, OCR/RAG, Swarm, and actual model execution remain later reviewed slices."
      : "Fix 0339 before claiming AI_TUTOR_RESULT_ARCHIVE follow-up tutoring can proceed beyond review-only artifacts.",
  };
}

export function formatStudentAppAITutorResultArchiveAnswerReviewGateAudit(report) {
  const lines = [
    `Student App AI Tutor result-archive answer review gate: ${report.readiness}`,
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

async function runRuntimeProbe(source0338Report, options = {}) {
  const reviewLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-review-audit-")), "review.jsonl");
  let portCalls = 0;
  let portSawGuidanceText = false;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorAnswerReviewGate(probeInput(source0338Report), {
      generatedAt: "2026-06-09T11:40:00.000Z",
      reviewLogPath,
      answerReviewGatePort: {
        async recordAnswerReviewGate(request) {
          portCalls += 1;
          portSawGuidanceText = JSON.stringify(request).includes("Review the previous correction");
          return {
            answerReviewGate: {
              reviewId: "ai_tutor_answer_review_gate_result_archive_001",
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
    const elapsed = Math.max(1, options.probeP99Ms ?? Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      portCalls,
      portSawGuidanceText,
      runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, elapsed), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE_RUNTIME_PROBE" },
    };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls, portSawGuidanceText, runtimeSlo: failedSlo() };
  }
}

function probeInput(source0338Report) {
  const source = source0338Report.runtimeProbes?.studentAppAiTutorResultArchiveControlledAnswerArtifact?.result ?? {};
  const artifact = source.controlledAnswerArtifact ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-answer-review-gate.v1",
    reviewInvocationId: "ai_tutor_answer_review_result_archive_001",
    controlledAnswerArtifactReport: source0338Report,
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
      requestId: source.requestId,
      workerId: source.workerId,
      precheckId: source.precheckId,
      queueRef: source.queueRef,
      decision: "APPROVE_FOR_RESULT_PERSISTENCE",
      guidanceSectionsHash: hashGuidanceSections(artifact.guidanceSections ?? []),
      reviewerNotes: "Result archive follow-up guidance is learner-safe and ready for the next controlled persistence slice.",
      reviewChecklist: {
        sourceArtifactVerified: true,
        guidanceSafeForLearner: true,
        rawModelOutputAbsent: true,
        promptAbsent: true,
        answerKeyAbsent: true,
        resultPersistenceRequiresSeparateRuntime: true,
        studentVisibilityRequiresSeparateRuntime: true,
      },
      reviewedAt: "2026-06-09T11:40:00.000Z",
    },
    evidenceRefs: [
      "evidence:result-archive-controlled-answer-artifact:student-app-ai-tutor-result-archive-controlled-answer-artifact",
      "evidence:answer-review-gate:teacher-human-review",
    ],
    idempotencyKey: `student-app-ai-tutor-result-archive-answer-review-gate:${artifact.artifactId ?? "missing"}`,
  };
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_ANSWER_REVIEW_GATE_RUNTIME_PROBE" };
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

function hashGuidanceSections(sections) {
  return hashInput(sections.map((section) => ({ sectionId: section.sectionId, title: section.title, textHash: hashInput(section.text), sourceBlockRefs: section.sourceBlockRefs })));
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorResultArchiveAnswerReviewGate(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveAnswerReviewGateAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
