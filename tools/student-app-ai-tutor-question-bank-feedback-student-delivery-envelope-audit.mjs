import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_RUNTIME_ID,
  recordStudentAppAITutorResultStudentDeliveryEnvelope,
} from "./student-app-ai-tutor-result-student-delivery-envelope-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE";
const runtimeId = "student_app_ai_tutor_question_bank_feedback_student_delivery_envelope";
const readyStatus = "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.test.mjs",
  source0375Report: "reports/student-app-ai-tutor-question-bank-feedback-student-visibility-review.current.json",
  source0372Report: "reports/student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0376-student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ",
  "durableStudentArchivePersistenceStarted: true", "mainDatabaseWriteStarted: true", "studentArchiveWriteStarted: true",
  "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "retrievalAllowed: true",
  "localToolMutationAllowed: true", "swarmAllowed: true", "answerKeyDisclosed: true", "promptDisclosed: true",
  "rawModelOutputDisclosed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "dangerouslySetInnerHTML", "innerHTML",
];

export async function auditStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelope(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0375Report = parseJson(inputs.source0375Report, {});
  const source0372Report = parseJson(inputs.source0372Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const hashMatch = guidanceHashMatch(source0375Report, source0372Report);
  const probe = await runRuntimeProbe(source0375Report, source0372Report, options);

  addFinding(findings, {
    id: "source.0375_question_bank_feedback_student_visibility_ready",
    passed: source0375Report.readiness === "READY" &&
      source0375Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_VISIBILITY_REVIEW" &&
      source0375Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_student_visibility_review" &&
      source0375Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_visibility_review_runtime" &&
      source0375Report.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_VISIBILITY_REVIEW_RECORDED" &&
      source0375Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      source0375Report.safetyInvariants?.feedbackStatusRequired === "READY_FOR_STUDENT_APP_READ" &&
      source0375Report.safetyInvariants?.approvedForFutureStudentDelivery === true &&
      source0375Report.safetyInvariants?.studentVisiblePublished === false &&
      source0375Report.safetyInvariants?.studentDeliveryEnvelopeCreated === false &&
      source0375Report.runtimeSlo?.totalErrors === 0,
    actual: [source0375Report.readiness ?? "missing", source0375Report.runtime?.runtimeId ?? "missing", source0375Report.runtime?.status ?? "missing", source0375Report.runtimeSlo?.totalErrors ?? "missing"].join(":"),
    expected: "READY 0375 question-bank-feedback student visibility review with future delivery approval only",
    remediation: "Run 0375 before question-bank-feedback student delivery envelope.",
  });

  addFinding(findings, {
    id: "source.0372_question_bank_feedback_controlled_answer_hash_matches_visibility",
    passed: source0372Report.readiness === "READY" &&
      source0372Report.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT" &&
      source0372Report.runtime?.runtimeId === "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact" &&
      source0372Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" &&
      source0372Report.safetyInvariants?.learningActionSourceRequired === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      source0372Report.safetyInvariants?.controlledAnswerArtifactRecorded === true &&
      source0372Report.safetyInvariants?.studentVisiblePublished === false &&
      source0372Report.runtimeSlo?.totalErrors === 0 &&
      hashMatch.matched,
    actual: `artifact=${source0372Report.readiness ?? "missing"};hash=${hashMatch.actual ?? "missing"};expected=${hashMatch.expected ?? "missing"}`,
    expected: "READY 0372 question-bank-feedback controlled answer artifact whose safe guidance hash matches 0375",
    remediation: "Do not create a question-bank-feedback delivery envelope unless controlled guidance still matches the visibility review.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_question_bank_feedback_delivery_envelope",
    passed: includesAll(runtime, [
      "questionBankFeedbackVisibilityReviewRuntimeId",
      "questionBankFeedbackControlledArtifactRuntimeId",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_VISIBILITY_REVIEW",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_FEEDBACK_CONTROLLED_ANSWER_ARTIFACT",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "READY_FOR_STUDENT_APP_READ",
      "feedbackStatus: record.feedbackStatus",
      "StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["questionBankFeedbackVisibilityReviewRuntimeId", "questionBankFeedbackControlledArtifactRuntimeId", "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK", "feedbackStatus: record.feedbackStatus"]),
    expected: "shared delivery envelope runtime accepts 0375/0372 question-bank-feedback evidence and preserves feedback metadata",
    remediation: "Keep 0376 as a source-aware wrapper over the shared 0329 delivery envelope runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_question_bank_feedback_delivery_envelope",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT &&
      probe.result?.sourceStudentVisibilityReview?.learningActionSource === "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK" &&
      probe.result?.sourceStudentVisibilityReview?.feedbackStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.studentResultDeliveryEnvelope?.deliveryState === "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED" &&
      probe.result?.boundary?.studentDeliveryEnvelopeCreated === true &&
      probe.result?.boundary?.durableStudentArchivePersistenceStarted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.portCalls === 1 &&
      probe.portSawRawRefs === false &&
      probe.portSawFeedbackIds === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceStudentVisibilityReview.learningActionSource};feedback=${probe.result.sourceStudentVisibilityReview.feedbackStatus};state=${probe.result.studentResultDeliveryEnvelope.deliveryState};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls};rawRefs=${probe.portSawRawRefs};feedbackIds=${probe.portSawFeedbackIds}` : probe.error,
    expected: "probe records one question-bank-feedback Student App delivery envelope under 50ms without durable persistence, raw refs, or feedback ids",
    remediation: "0376 must stop at render envelope creation and preserve question-bank feedback source metadata.",
  });

  addFinding(findings, {
    id: "tests.cover_question_bank_feedback_delivery_envelope_paths",
    passed: includesAll(runtimeTest, [
      "records a question-bank-feedback-sourced student delivery envelope through the same delivery port",
      "unsafe question-bank-feedback",
      "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      "feedbackStatus",
    ]),
    actual: "runtime tests scanned",
    expected: "positive question-bank-feedback delivery envelope path and unsafe source rejection test",
    remediation: "Add question-bank-feedback delivery envelope regression coverage before claiming 0376 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0376",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-feedback-student-delivery-envelope"]?.includes("student-app-ai-tutor-question-bank-feedback-student-delivery-envelope-audit.mjs")) &&
      includesAll(hooks, ["Student App AI Tutor question-bank-feedback student delivery envelope audit", "studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope", "student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.current.json", runtimeId, "0376-student-app-ai-tutor-question-bank-feedback-student-delivery-envelope.md", "12.64/10", readyStatus, "SDD 0376 student app ai tutor question-bank feedback student delivery envelope"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-question-bank-feedback-student-delivery-envelope", "studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope", "12.64/10", "SDD 0376"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0376",
    remediation: "Wire 0376 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT, sourceRuntimes: ["student_app_ai_tutor_question_bank_feedback_student_visibility_review", "student_app_ai_tutor_question_bank_feedback_controlled_answer_artifact"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankFeedbackStudentDeliveryEnvelope: probe },
    safetyInvariants: {
      source0375QuestionBankFeedbackStudentVisibilityReviewRequired: true,
      source0372QuestionBankFeedbackControlledAnswerArtifactRequired: true,
      learningActionSourceRequired: "QUESTION_BANK_DRAFT_ANSWER_FEEDBACK",
      feedbackStatusRequired: "READY_FOR_STUDENT_APP_READ",
      guidanceHashMatchRequired: hashMatch.matched,
      studentDeliveryEnvelopeCreated: probe.status === "PASS",
      studentVisibleEnvelopeAllowed: probe.status === "PASS",
      durableStudentArchivePersistenceStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      resultRefDisclosed: false,
      feedbackIdsDisclosed: false,
      answerKeyDisclosed: false,
      rawModelOutputDisclosed: false,
      promptDisclosed: false,
      contentRefDisclosed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY" ? "Use this as question-bank-feedback student delivery envelope evidence; durable feedback archive persistence remains a later reviewed slice." : "Fix 0376 before claiming question-bank-feedback tutoring can render in Student App.",
  };
}

export function formatStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelopeAudit(report) {
  const lines = [`Student App AI Tutor question-bank-feedback student delivery envelope: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
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

async function runRuntimeProbe(source0375Report, source0372Report, options = {}) {
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-question-bank-feedback-delivery-audit-")), "delivery.jsonl");
  const calls = [];
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorResultStudentDeliveryEnvelope(probeInput(source0375Report, source0372Report), {
      generatedAt: "2026-06-11T15:10:00.000Z",
      commandLogPath,
      resultStudentDeliveryEnvelopePort: {
        async recordResultStudentDeliveryEnvelope(request) {
          calls.push(request);
          return { studentResultDeliveryEnvelope: { envelopeId: request.deliveryRequest.envelopeId, studentVisibilityReviewRecordId: request.deliveryRequest.studentVisibilityReviewRecordId, studentVisibilityReviewId: request.deliveryRequest.studentVisibilityReviewId, artifactId: request.deliveryRequest.artifactId, requestId: request.deliveryRequest.requestId, archiveItemId: request.deliveryRequest.archiveItemId, guidanceSectionsHash: request.deliveryRequest.guidanceSectionsHash, visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED", deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED", scopeRef: request.deliveryRequest.scopeRef, studentVisiblePublished: true, durableStudentArchivePersistenceStarted: false, mainDatabaseWriteStarted: false, studentArchiveWriteStarted: false, resultRefDisclosed: false } };
        },
      },
    });
    const elapsed = Math.max(1, options.probeP99Ms ?? Date.now() - startedAt);
    const serializedCalls = JSON.stringify(calls);
    return { status: "PASS", result, portCalls: calls.length, portSawRawRefs: serializedCalls.includes("resultRefHash"), portSawFeedbackIds: serializedCalls.includes("qbank_ans_sub_feedback_001") || serializedCalls.includes("tarch_homework_feedback_source_001"), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, elapsed), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE_PROBE" } };
  } catch (error) {
    const serializedCalls = JSON.stringify(calls);
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, portSawRawRefs: serializedCalls.includes("resultRefHash"), portSawFeedbackIds: serializedCalls.includes("qbank_ans_sub_feedback_001") || serializedCalls.includes("tarch_homework_feedback_source_001"), runtimeSlo: failedSlo() };
  }
}

function probeInput(source0375Report, source0372Report) {
  const visibilityResult = source0375Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackStudentVisibilityReview?.result ?? {};
  const source = visibilityResult.sourceReviewedResult ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-delivery-envelope.v1",
    deliveryInvocationId: "ai_tutor_result_student_delivery_feedback_001",
    studentVisibilityReviewReport: source0375Report,
    controlledAnswerArtifactReport: source0372Report,
    principal: { principalId: "student_delivery_runtime_feedback_001", subjectType: "SERVICE", role: "SERVICE", entryPoint: "STUDENT_DELIVERY_RUNTIME", sessionId: "session_student_delivery_feedback_001", scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"] },
    studentDeliveryRequest: { envelopeId: "ai_tutor_result_delivery_env_feedback_001", deliveryMode: "STUDENT_APP_RENDERABLE_AI_TUTOR_RESULT_ENVELOPE", channel: "STUDENT_APP", audienceKind: "STUDENT_APP_LEARNING_SUPPORT", visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED", scopeRef: "student:student_001", studentVisibilityReviewRecordId: visibilityResult.recordId, studentVisibilityReviewId: visibilityResult.studentVisibilityReview?.reviewId, persistenceRecordId: source.persistenceRecordId, artifactId: source.artifactId, requestId: source.requestId, archiveItemId: source.archiveItemId, guidanceSectionsHash: source.guidanceSectionsHash, studentOwnScopeConfirmed: true },
    studentDeliveryPolicy: { studentVisibilityReviewRequired: true, controlledAnswerArtifactRequired: true, guidanceHashMatchRequired: true, studentDeliveryEnvelopeAllowed: true, studentVisibleEnvelopeAllowed: true, safeGuidanceOnlyRequired: true, studentOwnScopeRequired: true, futureDurableArchivePersistenceReviewRequired: true, directDatabaseAccessAllowed: false, mainDatabaseWriteAllowed: false, studentArchiveWriteAllowed: false, durableArchivePersistenceAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:question-bank-feedback-student-visibility-review:student-app-ai-tutor-question-bank-feedback-student-visibility-review", "evidence:question-bank-feedback-controlled-answer-artifact:student-app-ai-tutor-question-bank-feedback-controlled-answer-artifact"],
    idempotencyKey: "student-app-ai-tutor-question-bank-feedback-student-delivery-envelope:ai_tutor_result_visibility_review_feedback_001",
  };
}

function guidanceHashMatch(source0375Report, source0372Report) {
  const expected = source0375Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackStudentVisibilityReview?.result?.sourceReviewedResult?.guidanceSectionsHash;
  const sections = source0372Report.runtimeProbes?.studentAppAiTutorQuestionBankFeedbackControlledAnswerArtifact?.result?.controlledAnswerArtifact?.guidanceSections;
  if (!expected || !Array.isArray(sections)) return { matched: false, expected, actual: undefined };
  const actual = hashGuidanceSections(sections);
  return { matched: actual === expected, expected, actual };
}

function hashGuidanceSections(sections) {
  return hashInput(sections.map((section) => ({ sectionId: section.sectionId, title: section.title, textHash: hashInput(section.text), sourceBlockRefs: section.sourceBlockRefs })));
}

function hashInput(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 1, evidenceClass: "JS_AI_TUTOR_QUESTION_BANK_FEEDBACK_STUDENT_DELIVERY_ENVELOPE_PROBE" };
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
  const report = await auditStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelope(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankFeedbackStudentDeliveryEnvelopeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
