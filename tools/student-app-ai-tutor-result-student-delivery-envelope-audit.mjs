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

const defaultOutPath = "reports/student-app-ai-tutor-result-student-delivery-envelope.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-delivery-envelope-runtime.test.mjs",
  studentVisibilityReviewReport: "reports/student-app-ai-tutor-result-student-visibility-review.current.json",
  controlledAnswerArtifactReport: "reports/student-app-ai-tutor-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0329-student-app-ai-tutor-result-student-delivery-envelope.md",
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
  "durableStudentArchivePersistenceStarted: true",
  "mainDatabaseWriteStarted: true",
  "studentArchiveWriteStarted: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "modelInferenceAllowed: true",
  "retrievalAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "answerKeyDisclosed: true",
  "promptDisclosed: true",
  "rawModelOutputDisclosed: true",
  "contentRefDisclosed: true",
  "resultRefDisclosed: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export async function auditStudentAppAITutorResultStudentDeliveryEnvelope(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const visibilityReport = parseJson(inputs.studentVisibilityReviewReport, {});
  const artifactReport = parseJson(inputs.controlledAnswerArtifactReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.rootTrace ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const hashMatch = guidanceHashMatch(visibilityReport, artifactReport);
  const probe = await runRuntimeProbe(visibilityReport, artifactReport, options);

  addFinding(findings, {
    id: "source.0328_student_visibility_review_ready",
    passed: visibilityReport.readiness === "READY" &&
      visibilityReport.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW" &&
      visibilityReport.runtime?.runtimeId === "student_app_ai_tutor_result_student_visibility_review_runtime" &&
      visibilityReport.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_VISIBILITY_REVIEW_RECORDED" &&
      visibilityReport.safetyInvariants?.approvedForFutureStudentDelivery === true &&
      visibilityReport.safetyInvariants?.studentVisiblePublished === false &&
      visibilityReport.safetyInvariants?.studentDeliveryEnvelopeCreated === false &&
      visibilityReport.runtimeSlo?.totalErrors === 0,
    actual: `${visibilityReport.readiness ?? "missing"}:${visibilityReport.runtime?.status ?? "missing"}`,
    expected: "READY 0328 student visibility review that approves only a future delivery runtime",
    remediation: "Run 0328 student visibility review before creating a student delivery envelope.",
  });

  addFinding(findings, {
    id: "source.0325_controlled_answer_hash_matches_visibility_review",
    passed: artifactReport.readiness === "READY" &&
      artifactReport.workloadType === "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT" &&
      artifactReport.runtime?.runtimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" &&
      artifactReport.safetyInvariants?.controlledAnswerArtifactRecorded === true &&
      artifactReport.safetyInvariants?.rawModelOutputExcluded === true &&
      artifactReport.safetyInvariants?.promptExcluded === true &&
      artifactReport.safetyInvariants?.answerKeyExcluded === true &&
      artifactReport.safetyInvariants?.studentVisiblePublished === false &&
      hashMatch.matched,
    actual: `artifact=${artifactReport.readiness ?? "missing"};hash=${hashMatch.actual ?? "missing"};expected=${hashMatch.expected ?? "missing"}`,
    expected: "READY 0325 controlled answer artifact with safe guidance sections whose hash matches 0328",
    remediation: "Do not render AI Tutor guidance unless the controlled artifact hash matches the visibility review.",
  });

  addFinding(findings, {
    id: "runtime.identity_delivery_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT",
      "StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope",
      "recordStudentAppAITutorResultStudentDeliveryEnvelope",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      "STUDENT_DELIVERY_RUNTIME",
      "STUDENT_DELIVERY_ENVELOPE",
      "STUDENT_APP_DELIVERY",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_result_student_delivery_envelope_runtime",
      "StudentAppAITutorResultStudentDeliveryEnvelopePort.recordResultStudentDeliveryEnvelope",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent student delivery envelope through a controlled service port",
    remediation: "Keep 0329 port-based, replay-safe, and service-principal only.",
  });

  addFinding(findings, {
    id: "runtime.visible_envelope_without_persistence_or_unsafe_execution",
    passed: includesAll(runtime, [
      "studentVisibilityReviewVerified: true",
      "controlledAnswerArtifactVerified: true",
      "guidanceSectionsHashVerified: true",
      "safeGuidanceOnly: true",
      "studentOwnScopeEnforced: true",
      "studentDeliveryEnvelopeCreated: true",
      "studentVisiblePublished: true",
      "durableStudentArchivePersistenceStarted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "resultRefDisclosed: false",
      "answerKeyDisclosed: false",
      "promptDisclosed: false",
      "rawModelOutputDisclosed: false",
      "contentRefDisclosed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "modelInferenceAllowed: false",
      "retrievalAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "futureArchivePersistenceRequiresSeparateRuntime: true",
      "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime creates only a renderable Student App envelope and blocks DB writes, archive persistence, model, retrieval, tools, Swarm, and leaks",
    remediation: "Keep durable archive persistence and any model/retrieval work in later separate runtimes.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_student_visible_delivery_envelope",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT &&
      probe.result?.studentResultDeliveryEnvelope?.deliveryState === "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED" &&
      probe.result?.boundary?.studentDeliveryEnvelopeCreated === true &&
      probe.result?.boundary?.studentVisiblePublished === true &&
      probe.result?.boundary?.durableStudentArchivePersistenceStarted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};visible=${probe.result.boundary.studentVisiblePublished};persisted=${probe.result.boundary.durableStudentArchivePersistenceStarted};p99=${probe.runtimeSlo.p99Ms};calls=${probe.portCalls}`
      : probe.error,
    expected: "probe records one Student App renderable AI Tutor result envelope under 50ms without persistence",
    remediation: "0329 must stop at student delivery envelope creation and not start archive writes.",
  });

  addFinding(findings, {
    id: "tests.cover_delivery_envelope_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a student-visible AI Tutor result envelope while keeping durable persistence blocked",
      "uses idempotency for replay and rejects conflicting delivery envelopes",
      "rejects unsafe principals, non-ready sources, unapproved visibility, and hash mismatches",
      "rejects unsafe policies, delivery mismatches, leaked fields, unsafe text, and unsafe port results",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, principal, source readiness, approval, hash, unsafe policy, mismatch, leak, unsafe text, and unsafe port tests",
    remediation: "Add regression coverage before using 0329 as student delivery evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-student-delivery-envelope"]?.includes("student-app-ai-tutor-result-student-delivery-envelope-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor result student delivery envelope runtime audit",
        "studentAppAiTutorResultStudentDeliveryEnvelope",
        "student-app-ai-tutor-result-student-delivery-envelope.current.json",
        "student_app_ai_tutor_result_student_delivery_envelope_runtime",
        "0329-student-app-ai-tutor-result-student-delivery-envelope.md",
        "SDD 0329 student app ai tutor result student delivery envelope",
        "11.23/10",
        "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-student-delivery-envelope",
      "studentAppAiTutorResultStudentDeliveryEnvelope",
      "11.23/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0329",
    remediation: "Wire student delivery envelope evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PORT,
      sourceVisibilityReviewRuntime: "student_app_ai_tutor_result_student_visibility_review_runtime",
      sourceControlledAnswerArtifactRuntime: "student_app_ai_tutor_controlled_answer_artifact_runtime",
      status: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultStudentDeliveryEnvelope: probe },
    safetyInvariants: {
      studentVisibilityReviewRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: hashMatch.matched,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleEnvelopeAllowed: true,
      safeGuidanceOnlyRequired: true,
      studentVisiblePublished: probe.status === "PASS",
      studentDeliveryEnvelopeCreated: probe.status === "PASS",
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
    nextAction: readiness === "READY"
      ? "Use this as the AI Tutor result student delivery envelope evidence; durable archive persistence remains a later reviewed slice."
      : "Fix 0329 student delivery envelope evidence before claiming student-render readiness.",
  };
}

export function formatStudentAppAITutorResultStudentDeliveryEnvelopeAudit(report) {
  const lines = [
    `Student App AI Tutor result student delivery envelope runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: ${finding.actual}`);
  lines.push("", `Next: ${report.nextAction}`);
  return lines.join("\n");
}

function runRuntimeProbe(visibilityReport, artifactReport) {
  const calls = [];
  return recordStudentAppAITutorResultStudentDeliveryEnvelope(probeInput(visibilityReport, artifactReport), {
    generatedAt: "2026-06-08T11:10:00.000Z",
    commandLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-result-student-delivery-")), "delivery.jsonl"),
    resultStudentDeliveryEnvelopePort: {
      async recordResultStudentDeliveryEnvelope(request) {
        calls.push(request);
        return {
          studentResultDeliveryEnvelope: {
            envelopeId: request.deliveryRequest.envelopeId,
            studentVisibilityReviewRecordId: request.deliveryRequest.studentVisibilityReviewRecordId,
            studentVisibilityReviewId: request.deliveryRequest.studentVisibilityReviewId,
            artifactId: request.deliveryRequest.artifactId,
            requestId: request.deliveryRequest.requestId,
            archiveItemId: request.deliveryRequest.archiveItemId,
            guidanceSectionsHash: request.deliveryRequest.guidanceSectionsHash,
            visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED",
            deliveryState: "READY_FOR_STUDENT_APP_RENDER_NOT_ARCHIVED",
            scopeRef: request.deliveryRequest.scopeRef,
            studentVisiblePublished: true,
            durableStudentArchivePersistenceStarted: false,
            mainDatabaseWriteStarted: false,
            studentArchiveWriteStarted: false,
            resultRefDisclosed: false,
          },
        };
      },
    },
  }).then((result) => ({
    status: "PASS",
    result,
    portCalls: calls.length,
    runtimeSlo: result.runtimeSlo,
  })).catch((error) => ({
    status: "FAIL",
    error: error.message,
    portCalls: calls.length,
    runtimeSlo: failedSlo(),
  }));
}

function probeInput(visibilityReport, artifactReport) {
  const visibilityResult = visibilityReport.runtimeProbes?.studentAppAiTutorResultStudentVisibilityReview?.result ?? {};
  const source = visibilityResult.sourceReviewedResult ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-delivery-envelope.v1",
    deliveryInvocationId: "ai_tutor_result_student_delivery_001",
    studentVisibilityReviewReport: visibilityReport,
    controlledAnswerArtifactReport: artifactReport,
    principal: {
      principalId: "student_delivery_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_DELIVERY_RUNTIME",
      sessionId: "session_student_delivery_result_001",
      scopes: ["TEACHING_READ", "STUDENT_DELIVERY_ENVELOPE", "STUDENT_APP_DELIVERY"],
    },
    studentDeliveryRequest: {
      envelopeId: "ai_tutor_result_delivery_env_001",
      deliveryMode: "STUDENT_APP_RENDERABLE_AI_TUTOR_RESULT_ENVELOPE",
      channel: "STUDENT_APP",
      audienceKind: "STUDENT_APP_LEARNING_SUPPORT",
      visibilityState: "STUDENT_VISIBLE_AI_TUTOR_RESULT_DELIVERY_ENVELOPE_NOT_ARCHIVED",
      scopeRef: "student:student_001",
      studentVisibilityReviewRecordId: visibilityResult.recordId,
      studentVisibilityReviewId: visibilityResult.studentVisibilityReview?.reviewId,
      persistenceRecordId: source.persistenceRecordId,
      artifactId: source.artifactId,
      requestId: source.requestId,
      archiveItemId: source.archiveItemId,
      guidanceSectionsHash: source.guidanceSectionsHash,
      studentOwnScopeConfirmed: true,
    },
    studentDeliveryPolicy: {
      studentVisibilityReviewRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: true,
      studentDeliveryEnvelopeAllowed: true,
      studentVisibleEnvelopeAllowed: true,
      safeGuidanceOnlyRequired: true,
      studentOwnScopeRequired: true,
      futureDurableArchivePersistenceReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      durableArchivePersistenceAllowed: false,
      executeHttpRequestAllowed: false,
      modelInferenceAllowed: false,
      retrievalAllowed: false,
      answerKeyDisclosureAllowed: false,
      rawModelOutputDisclosureAllowed: false,
      resultRefDisclosureAllowed: false,
      promptDisclosureAllowed: false,
      contentRefDisclosureAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:student-visibility-review:student-app-ai-tutor-result-student-visibility-review",
      "evidence:controlled-answer-artifact:student-app-ai-tutor-controlled-answer-artifact",
    ],
    idempotencyKey: "student-app-ai-tutor-result-student-delivery-envelope:ai_tutor_result_visibility_review_001",
  };
}

function guidanceHashMatch(visibilityReport, artifactReport) {
  const expected = visibilityReport.runtimeProbes?.studentAppAiTutorResultStudentVisibilityReview?.result?.sourceReviewedResult?.guidanceSectionsHash;
  const sections = artifactReport.runtimeProbes?.studentAppAiTutorControlledAnswerArtifact?.result?.controlledAnswerArtifact?.guidanceSections;
  if (!expected || !Array.isArray(sections)) return { matched: false, expected, actual: undefined };
  const actual = hashGuidanceSections(sections);
  return { matched: actual === expected, expected, actual };
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

function loadCurrentInputs(root = process.cwd()) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, readOptional(path.join(root, file))]));
}

function readOptional(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
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

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
}

function summarizePresence(text, needles) {
  return needles.map((needle) => `${needle}=${text.includes(needle)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: 999, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_PROBE" };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : defaultOutPath;
  const report = await auditStudentAppAITutorResultStudentDeliveryEnvelope(loadCurrentInputs());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultStudentDeliveryEnvelopeAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
