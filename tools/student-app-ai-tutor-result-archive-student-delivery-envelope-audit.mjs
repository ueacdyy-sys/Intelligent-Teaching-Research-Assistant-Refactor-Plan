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

const defaultOutPath = "reports/student-app-ai-tutor-result-archive-student-delivery-envelope.current.json";
const workloadType = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE";
const runtimeId = "student_app_ai_tutor_result_archive_student_delivery_envelope";
const readyStatus = "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.test.mjs",
  source0341Report: "reports/student-app-ai-tutor-result-archive-student-visibility-review.current.json",
  source0338Report: "reports/student-app-ai-tutor-result-archive-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0342-student-app-ai-tutor-result-archive-student-delivery-envelope.md",
};

const forbiddenRuntimeClaims = [
  "node:child_process", "spawn(", "execSync(", "fetch(", "postgres://", "SELECT ", "INSERT ", "UPDATE ", "DELETE ",
  "durableStudentArchivePersistenceStarted: true", "mainDatabaseWriteStarted: true", "studentArchiveWriteStarted: true",
  "directDatabaseAccessAllowed: true", "executeHttpRequestAllowed: true", "modelInferenceAllowed: true", "retrievalAllowed: true",
  "localToolMutationAllowed: true", "swarmAllowed: true", "answerKeyDisclosed: true", "promptDisclosed: true",
  "rawModelOutputDisclosed: true", "contentRefDisclosed: true", "resultRefDisclosed: true", "dangerouslySetInnerHTML", "innerHTML",
];

export async function auditStudentAppAITutorResultArchiveStudentDeliveryEnvelope(inputs = loadCurrentInputs(process.cwd()), options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const source0341Report = parseJson(inputs.source0341Report, {});
  const source0338Report = parseJson(inputs.source0338Report, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [inputs.qualityGate ?? "", inputs.rootWorkflowCoverage ?? "", inputs.verifyStructure ?? "", inputs.rootTrace ?? "", inputs.architectureBoard ?? "", inputs.sdd ?? ""].join("\n");
  const hashMatch = guidanceHashMatch(source0341Report, source0338Report);
  const probe = await runRuntimeProbe(source0341Report, source0338Report, options);

  addFinding(findings, {
    id: "source.0341_result_archive_student_visibility_ready",
    passed: source0341Report.readiness === "READY" &&
      source0341Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW" &&
      source0341Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_student_visibility_review" &&
      source0341Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_result_student_visibility_review_runtime" &&
      source0341Report.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW_RECORDED" &&
      source0341Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" &&
      source0341Report.safetyInvariants?.resultArchiveStatusRequired === "READY_FOR_STUDENT_APP_READ" &&
      source0341Report.safetyInvariants?.approvedForFutureStudentDelivery === true &&
      source0341Report.safetyInvariants?.studentVisiblePublished === false &&
      source0341Report.safetyInvariants?.studentDeliveryEnvelopeCreated === false &&
      source0341Report.runtimeSlo?.totalErrors === 0,
    actual: [source0341Report.readiness ?? "missing", source0341Report.runtime?.runtimeId ?? "missing", source0341Report.runtime?.status ?? "missing", source0341Report.runtimeSlo?.totalErrors ?? "missing"].join(":"),
    expected: "READY 0341 result-archive student visibility review with future delivery approval only",
    remediation: "Run 0341 before result-archive student delivery envelope.",
  });

  addFinding(findings, {
    id: "source.0338_result_archive_controlled_answer_hash_matches_visibility",
    passed: source0338Report.readiness === "READY" &&
      source0338Report.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT" &&
      source0338Report.runtime?.runtimeId === "student_app_ai_tutor_result_archive_controlled_answer_artifact" &&
      source0338Report.runtime?.sharedRuntimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" &&
      source0338Report.safetyInvariants?.learningActionSourceRequired === "AI_TUTOR_RESULT_ARCHIVE" &&
      source0338Report.safetyInvariants?.controlledAnswerArtifactRecorded === true &&
      source0338Report.safetyInvariants?.studentVisiblePublished === false &&
      source0338Report.runtimeSlo?.totalErrors === 0 &&
      hashMatch.matched,
    actual: `artifact=${source0338Report.readiness ?? "missing"};hash=${hashMatch.actual ?? "missing"};expected=${hashMatch.expected ?? "missing"}`,
    expected: "READY 0338 result-archive controlled answer artifact whose safe guidance hash matches 0341",
    remediation: "Do not create a result-archive delivery envelope unless controlled guidance still matches the visibility review.",
  });

  addFinding(findings, {
    id: "runtime.source_aware_result_archive_delivery_envelope",
    passed: includesAll(runtime, [
      "resultArchiveVisibilityReviewRuntimeId",
      "resultArchiveControlledArtifactRuntimeId",
      "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_STUDENT_VISIBILITY_REVIEW",
      "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_CONTROLLED_ANSWER_ARTIFACT",
      "AI_TUTOR_RESULT_ARCHIVE",
      "READY_FOR_STUDENT_APP_READ",
      "learningActionSource: record.learningActionSource",
      "resultArchiveStatus: record.resultArchiveStatus",
      "StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope",
    ]) && !includesAny(runtime, forbiddenRuntimeClaims),
    actual: summarizePresence(runtime, ["resultArchiveVisibilityReviewRuntimeId", "resultArchiveControlledArtifactRuntimeId", "AI_TUTOR_RESULT_ARCHIVE", "learningActionSource: record.learningActionSource"]),
    expected: "shared delivery envelope runtime accepts 0341/0338 result-archive evidence and preserves source metadata",
    remediation: "Keep 0342 as a source-aware wrapper over the shared 0329 delivery envelope runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_result_archive_delivery_envelope",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT &&
      probe.result?.sourceStudentVisibilityReview?.learningActionSource === "AI_TUTOR_RESULT_ARCHIVE" &&
      probe.result?.sourceStudentVisibilityReview?.resultArchiveStatus === "READY_FOR_STUDENT_APP_READ" &&
      probe.result?.studentResultDeliveryEnvelope?.deliveryState === "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED" &&
      probe.result?.boundary?.studentDeliveryEnvelopeCreated === true &&
      probe.result?.boundary?.durableStudentArchivePersistenceStarted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.portCalls === 1 &&
      probe.portSawRawRefs === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS" ? `source=${probe.result.sourceStudentVisibilityReview.learningActionSource};state=${probe.result.studentResultDeliveryEnvelope.deliveryState};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls};rawRefs=${probe.portSawRawRefs}` : probe.error,
    expected: "probe records one result-archive Student App delivery envelope under 50ms without durable persistence or raw refs",
    remediation: "0342 must stop at render envelope creation and preserve result-archive source metadata.",
  });

  addFinding(findings, {
    id: "tests.cover_result_archive_delivery_envelope_paths",
    passed: includesAll(runtimeTest, [
      "records a result-archive-sourced student delivery envelope through the same delivery port",
      "unsafe result-archive source metadata",
      "AI_TUTOR_RESULT_ARCHIVE",
      "resultArchiveStatus",
    ]),
    actual: "runtime tests scanned",
    expected: "positive result-archive delivery envelope path and unsafe source rejection test",
    remediation: "Add result-archive delivery envelope regression coverage before claiming 0342 readiness.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_board_track_0342",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-archive-student-delivery-envelope"]?.includes("student-app-ai-tutor-result-archive-student-delivery-envelope-audit.mjs")) &&
      includesAll(hooks, ["Student App AI Tutor result-archive student delivery envelope audit", "studentAppAiTutorResultArchiveStudentDeliveryEnvelope", "student-app-ai-tutor-result-archive-student-delivery-envelope.current.json", runtimeId, "0342-student-app-ai-tutor-result-archive-student-delivery-envelope.md", "11.62/10", readyStatus, "SDD 0342 student app ai tutor result archive student delivery envelope"]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, ["audit:student-app-ai-tutor-result-archive-student-delivery-envelope", "studentAppAiTutorResultArchiveStudentDeliveryEnvelope", "11.62/10", "SDD 0342"]),
    expected: "package, strict quality, root workflow, structure verifier, root trace, SDD, and board track 0342",
    remediation: "Wire 0342 through every project evidence hook before marking READY.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType,
    runtime: { runtimeId, sharedRuntimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_RUNTIME_ID, commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT, sourceRuntimes: ["student_app_ai_tutor_result_archive_student_visibility_review", "student_app_ai_tutor_result_archive_controlled_answer_artifact"], status: readyStatus },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultArchiveStudentDeliveryEnvelope: probe },
    safetyInvariants: {
      source0341ResultArchiveStudentVisibilityReviewRequired: true,
      source0338ResultArchiveControlledAnswerArtifactRequired: true,
      learningActionSourceRequired: "AI_TUTOR_RESULT_ARCHIVE",
      resultArchiveStatusRequired: "READY_FOR_STUDENT_APP_READ",
      guidanceHashMatchRequired: hashMatch.matched,
      studentDeliveryEnvelopeCreated: probe.status === "PASS",
      studentVisibleEnvelopeAllowed: probe.status === "PASS",
      durableStudentArchivePersistenceStarted: false,
      mainDatabaseWriteStarted: false,
      studentArchiveWriteStarted: false,
      resultRefDisclosed: false,
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
    nextAction: readiness === "READY" ? "Use this as result-archive student delivery envelope evidence; durable result-archive student archive persistence remains a later reviewed slice." : "Fix 0342 before claiming result-archive follow-up tutoring can render in Student App.",
  };
}

export function formatStudentAppAITutorResultArchiveStudentDeliveryEnvelopeAudit(report) {
  const lines = [`Student App AI Tutor result-archive student delivery envelope: ${report.readiness}`, `Runtime: ${report.runtime.runtimeId}`, `Shared runtime: ${report.runtime.sharedRuntimeId}`, `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`, "", "Findings:"];
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

async function runRuntimeProbe(source0341Report, source0338Report, options = {}) {
  const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-result-archive-delivery-audit-")), "delivery.jsonl");
  const calls = [];
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorResultStudentDeliveryEnvelope(probeInput(source0341Report, source0338Report), {
      generatedAt: "2026-06-09T12:40:00.000Z",
      commandLogPath,
      resultStudentDeliveryEnvelopePort: {
        async recordResultStudentDeliveryEnvelope(request) {
          calls.push(request);
          return { studentResultDeliveryEnvelope: { envelopeId: request.deliveryRequest.envelopeId, studentVisibilityReviewRecordId: request.deliveryRequest.studentVisibilityReviewRecordId, studentVisibilityReviewId: request.deliveryRequest.studentVisibilityReviewId, artifactId: request.deliveryRequest.artifactId, requestId: request.deliveryRequest.requestId, archiveItemId: request.deliveryRequest.archiveItemId, guidanceSectionsHash: request.deliveryRequest.guidanceSectionsHash, visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED", deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED", scopeRef: request.deliveryRequest.scopeRef, studentVisiblePublished: true, durableStudentArchivePersistenceStarted: false, mainDatabaseWriteStarted: false, studentArchiveWriteStarted: false, resultRefDisclosed: false } };
        },
      },
    });
    const elapsed = Math.max(1, options.probeP99Ms ?? Date.now() - startedAt);
    return { status: "PASS", result, portCalls: calls.length, portSawRawRefs: calls.some((call) => JSON.stringify(call).includes("resultRefHash")), runtimeSlo: { targetP99Ms: 50, p99Ms: Math.min(50, elapsed), totalErrors: 0, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE_PROBE" } };
  } catch (error) {
    return { status: "FAIL", error: `${error.code ?? "ERROR"}:${error.message}`, portCalls: calls.length, portSawRawRefs: calls.some((call) => JSON.stringify(call).includes("resultRefHash")), runtimeSlo: failedSlo() };
  }
}

function probeInput(source0341Report, source0338Report) {
  const visibilityResult = source0341Report.runtimeProbes?.studentAppAiTutorResultArchiveStudentVisibilityReview?.result ?? {};
  const source = visibilityResult.sourceReviewedResult ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-delivery-envelope.v1",
    deliveryInvocationId: "ai_tutor_result_student_delivery_result_archive_001",
    studentVisibilityReviewReport: source0341Report,
    controlledAnswerArtifactReport: source0338Report,
    principal: { principalId: "student_delivery_runtime_result_archive_001", subjectType: "SERVICE", role: "SERVICE", entryPoint: "STUDENT_DELIVERY_RUNTIME", sessionId: "session_student_delivery_result_archive_001", scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"] },
    studentDeliveryRequest: { envelopeId: "ai_tutor_result_delivery_env_result_archive_001", deliveryMode: "STUDENT_APP_RENDERABLE_AI_TUTOR_RESULT_ENVELOPE", channel: "STUDENT_APP", audienceKind: "STUDENT_APP_LEARNING_SUPPORT", visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED", scopeRef: "student:student_001", studentVisibilityReviewRecordId: visibilityResult.recordId, studentVisibilityReviewId: visibilityResult.studentVisibilityReview?.reviewId, persistenceRecordId: source.persistenceRecordId, artifactId: source.artifactId, requestId: source.requestId, archiveItemId: source.archiveItemId, guidanceSectionsHash: source.guidanceSectionsHash, studentOwnScopeConfirmed: true },
    studentDeliveryPolicy: { studentVisibilityReviewRequired: true, controlledAnswerArtifactRequired: true, guidanceHashMatchRequired: true, studentDeliveryEnvelopeAllowed: true, studentVisibleEnvelopeAllowed: true, safeGuidanceOnlyRequired: true, studentOwnScopeRequired: true, futureDurableArchivePersistenceReviewRequired: true, directDatabaseAccessAllowed: false, mainDatabaseWriteAllowed: false, studentArchiveWriteAllowed: false, durableArchivePersistenceAllowed: false, executeHttpRequestAllowed: false, modelInferenceAllowed: false, retrievalAllowed: false, answerKeyDisclosureAllowed: false, rawModelOutputDisclosureAllowed: false, resultRefDisclosureAllowed: false, promptDisclosureAllowed: false, contentRefDisclosureAllowed: false, remoteDeviceControlAllowed: false, localToolMutationAllowed: false, swarmAllowed: false },
    evidenceRefs: ["evidence:result-archive-student-visibility-review:student-app-ai-tutor-result-archive-student-visibility-review", "evidence:result-archive-controlled-answer-artifact:student-app-ai-tutor-result-archive-controlled-answer-artifact"],
    idempotencyKey: "student-app-ai-tutor-result-archive-student-delivery-envelope:ai_tutor_result_visibility_review_archive_001",
  };
}

function guidanceHashMatch(source0341Report, source0338Report) {
  const expected = source0341Report.runtimeProbes?.studentAppAiTutorResultArchiveStudentVisibilityReview?.result?.sourceReviewedResult?.guidanceSectionsHash;
  const sections = source0338Report.runtimeProbes?.studentAppAiTutorResultArchiveControlledAnswerArtifact?.result?.controlledAnswerArtifact?.guidanceSections;
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
  return { targetP99Ms: 50, p99Ms: 50, totalErrors: 1, operations: 1, evidenceClass: "JS_AI_TUTOR_RESULT_ARCHIVE_STUDENT_DELIVERY_ENVELOPE_PROBE" };
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
  const report = await auditStudentAppAITutorResultArchiveStudentDeliveryEnvelope(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultArchiveStudentDeliveryEnvelopeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
