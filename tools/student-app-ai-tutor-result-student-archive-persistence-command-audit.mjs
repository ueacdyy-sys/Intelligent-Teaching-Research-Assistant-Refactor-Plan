import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID,
  recordStudentAppAITutorResultStudentArchivePersistenceCommand,
} from "./student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-result-student-archive-persistence-command.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-result-student-archive-persistence-command-runtime.test.mjs",
  deliveryEnvelopeReport: "reports/student-app-ai-tutor-result-student-delivery-envelope.current.json",
  controlledAnswerArtifactReport: "reports/student-app-ai-tutor-controlled-answer-artifact.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  rootTrace: "docs/sdd/0000-root-requirements-trace.md",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0330-student-app-ai-tutor-result-student-archive-persistence-command.md",
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
  "durableStudentArchiveCommitStarted: true",
  "studentArchivePersisted: true",
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

export function auditStudentAppAITutorResultStudentArchivePersistenceCommand(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const deliveryReport = parseJson(inputs.deliveryEnvelopeReport, {});
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
  const hashMatch = guidanceHashMatch(deliveryReport, artifactReport);
  const probe = runRuntimeProbe(deliveryReport, artifactReport, options);

  addFinding(findings, {
    id: "source.0329_student_delivery_envelope_ready",
    passed: deliveryReport.readiness === "READY" &&
      deliveryReport.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE" &&
      deliveryReport.runtime?.runtimeId === "student_app_ai_tutor_result_student_delivery_envelope_runtime" &&
      deliveryReport.runtime?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_DELIVERY_ENVELOPE_READY_NOT_PERSISTED" &&
      deliveryReport.safetyInvariants?.studentDeliveryEnvelopeCreated === true &&
      deliveryReport.safetyInvariants?.studentVisiblePublished === true &&
      deliveryReport.safetyInvariants?.durableStudentArchivePersistenceStarted === false &&
      deliveryReport.safetyInvariants?.mainDatabaseWriteStarted === false &&
      deliveryReport.safetyInvariants?.studentArchiveWriteStarted === false &&
      deliveryReport.runtimeSlo?.totalErrors === 0,
    actual: `${deliveryReport.readiness ?? "missing"}:${deliveryReport.runtime?.status ?? "missing"}`,
    expected: "READY 0329 Student App renderable AI Tutor result envelope that is not archived",
    remediation: "Run 0329 student delivery envelope before recording archive persistence commands.",
  });

  addFinding(findings, {
    id: "source.0325_safe_guidance_hash_matches_delivery_envelope",
    passed: artifactReport.readiness === "READY" &&
      artifactReport.workloadType === "STUDENT_APP_AI_TUTOR_CONTROLLED_ANSWER_ARTIFACT" &&
      artifactReport.runtime?.runtimeId === "student_app_ai_tutor_controlled_answer_artifact_runtime" &&
      artifactReport.safetyInvariants?.controlledAnswerArtifactRecorded === true &&
      artifactReport.safetyInvariants?.rawModelOutputExcluded === true &&
      artifactReport.safetyInvariants?.promptExcluded === true &&
      artifactReport.safetyInvariants?.answerKeyExcluded === true &&
      hashMatch.matched,
    actual: `artifact=${artifactReport.readiness ?? "missing"};hash=${hashMatch.actual ?? "missing"};expected=${hashMatch.expected ?? "missing"}`,
    expected: "READY 0325 controlled answer artifact whose safe guidance hash matches the 0329 envelope",
    remediation: "Do not record archive persistence commands unless safe guidance still matches the delivery envelope.",
  });

  addFinding(findings, {
    id: "runtime.identity_command_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT",
      "StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand",
      "recordStudentAppAITutorResultStudentArchivePersistenceCommand",
      "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      "STUDENT_ARCHIVE_WRITE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_result_student_archive_persistence_command_runtime",
      "StudentAppAITutorResultStudentArchivePersistenceCommandPort.recordResultStudentArchivePersistenceCommand",
      "STUDENT_ARCHIVE_WRITE",
      "findExistingRecordByIdempotencyKey",
    ]),
    expected: "runtime records an idempotent append-only archive persistence command behind the controlled service principal",
    remediation: "Keep 0330 replay-safe and service-principal only.",
  });

  addFinding(findings, {
    id: "runtime.command_without_commit_or_unsafe_execution",
    passed: includesAll(runtime, [
      "resultStudentDeliveryEnvelopeVerified: true",
      "controlledAnswerArtifactVerified: true",
      "guidanceSectionsHashVerified: true",
      "safeGuidanceOnly: true",
      "studentOwnScopeEnforced: true",
      "studentArchivePersistenceCommandRecorded: true",
      "appendOnlyCommandLogRecorded: true",
      "durableStudentArchivePersistenceStarted: false",
      "durableStudentArchiveCommitStarted: false",
      "studentArchivePersisted: false",
      "mainDatabaseWriteStarted: false",
      "studentArchiveWriteStarted: false",
      "resultRefDisclosed: false",
      "answerKeyDisclosed: false",
      "promptDisclosed: false",
      "rawModelOutputDisclosed: false",
      "contentRefDisclosed: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "modelInferenceStarted: false",
      "retrievalStarted: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureDurableArchiveCommitReview: true",
      "STUDENT_APP_AI_TUTOR_RESULT_ARCHIVE_PERSISTENCE_COMMAND",
      "NOT_COMMITTED_TO_STUDENT_ARCHIVE",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime records only append-only command evidence while blocking DB writes, durable commit, model, retrieval, tools, Swarm, and leaks",
    remediation: "Keep durable archive storage commit as a later reviewed runtime.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_archive_command_not_commit",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT &&
      probe.result?.studentArchivePersistenceCommand?.commitState === "NOT_COMMITTED_TO_STUDENT_ARCHIVE" &&
      probe.result?.boundary?.studentArchivePersistenceCommandRecorded === true &&
      probe.result?.boundary?.durableStudentArchiveCommitStarted === false &&
      probe.result?.boundary?.studentArchivePersisted === false &&
      probe.result?.boundary?.studentArchiveWriteStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};command=${probe.result.studentArchivePersistenceCommand.commandId};commit=${probe.result.boundary.durableStudentArchiveCommitStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one append-only AI Tutor result archive persistence command under 50ms without durable commit",
    remediation: "0330 must not start durable student archive writes.",
  });

  addFinding(findings, {
    id: "tests.cover_archive_persistence_negative_paths",
    passed: includesAll(runtimeTest, [
      "records an append-only AI Tutor result archive persistence command without durable commit",
      "uses idempotency for replay and rejects conflicting archive persistence commands",
      "rejects unsafe principals, non-ready delivery, hash mismatches, unsafe policies, and request mismatches",
      "rejects leaked result, answer, prompt, content, model, commit, internal error fields and unsafe guidance text",
    ]),
    actual: "runtime tests scanned",
    expected: "positive command, idempotency, principal, source readiness, hash, policy, mismatch, leaked-field, and unsafe text tests",
    remediation: "Add regression coverage before using 0330 as archive persistence command evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_trace_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-result-student-archive-persistence-command"]?.includes("student-app-ai-tutor-result-student-archive-persistence-command-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor result student archive persistence command runtime audit",
        "studentAppAiTutorResultStudentArchivePersistenceCommand",
        "student-app-ai-tutor-result-student-archive-persistence-command.current.json",
        "student_app_ai_tutor_result_student_archive_persistence_command_runtime",
        "0330-student-app-ai-tutor-result-student-archive-persistence-command.md",
        "SDD 0330 student app ai tutor result student archive persistence command",
        "11.26/10",
        "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-result-student-archive-persistence-command",
      "studentAppAiTutorResultStudentArchivePersistenceCommand",
      "11.26/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, root trace, SDD, and architecture board track 0330",
    remediation: "Wire archive persistence command evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PORT,
      sourceDeliveryEnvelopeRuntime: "student_app_ai_tutor_result_student_delivery_envelope_runtime",
      sourceControlledAnswerArtifactRuntime: "student_app_ai_tutor_controlled_answer_artifact_runtime",
      status: "STUDENT_APP_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorResultStudentArchivePersistenceCommand: probe },
    safetyInvariants: {
      resultStudentDeliveryEnvelopeRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: hashMatch.matched,
      appendOnlyCommandLogRequired: true,
      safeGuidanceOnlyRequired: true,
      studentArchivePersistenceCommandRecorded: probe.status === "PASS",
      durableStudentArchivePersistenceStarted: false,
      durableStudentArchiveCommitStarted: false,
      studentArchivePersisted: false,
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
      ? "Use this as the AI Tutor result student archive persistence command evidence; durable archive storage commit remains a later reviewed slice."
      : "Fix 0330 archive persistence command evidence before claiming archive-command readiness.",
  };
}

export function formatStudentAppAITutorResultStudentArchivePersistenceCommandAudit(report) {
  const lines = [
    `Student App AI Tutor result student archive persistence command runtime: ${report.readiness}`,
    `Runtime: ${report.runtime.runtimeId}`,
    `P99/errors: ${report.runtimeSlo.p99Ms}ms/${report.runtimeSlo.totalErrors}`,
    "",
    "Findings:",
  ];
  for (const finding of report.findings) lines.push(`- ${finding.passed ? "PASS" : "FAIL"} ${finding.id}: ${finding.actual}`);
  lines.push("", `Next: ${report.nextAction}`);
  return lines.join("\n");
}

function runRuntimeProbe(deliveryReport, artifactReport, options = {}) {
  try {
    const result = recordStudentAppAITutorResultStudentArchivePersistenceCommand(probeInput(deliveryReport, artifactReport), {
      generatedAt: "2026-06-08T12:10:00.000Z",
      commandLogPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-tutor-result-archive-persistence-")), "persistence.jsonl"),
    });
    return { status: "PASS", result, runtimeSlo: result.runtimeSlo };
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: failedSlo() };
  }
}

function probeInput(deliveryReport, artifactReport) {
  const result = deliveryReport.runtimeProbes?.studentAppAiTutorResultStudentDeliveryEnvelope?.result ?? {};
  const envelope = result.studentResultDeliveryEnvelope ?? {};
  return {
    schemaVersion: "2026-06-08.student-app.ai-tutor-result-student-archive-persistence-command.v1",
    persistenceInvocationId: "ai_tutor_result_archive_persist_001",
    studentResultDeliveryEnvelopeReport: deliveryReport,
    controlledAnswerArtifactReport: artifactReport,
    principal: {
      principalId: "student_archive_persistence_runtime_001",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "STUDENT_ARCHIVE_PERSISTENCE_RUNTIME",
      sessionId: "session_student_archive_persistence_001",
      scopes: ["TEACHING_READ", "STUDENT_ARCHIVE_WRITE", "STUDENT_APP_DELIVERY"],
    },
    studentArchivePersistenceRequest: {
      commandId: "ai_tutor_result_archive_cmd_001",
      persistenceMode: "APPEND_ONLY_STUDENT_ARCHIVE_COMMAND",
      targetArchiveKind: "STUDENT_AI_TUTOR_RESULT_ARCHIVE",
      desiredArchiveState: "PERSISTENCE_COMMAND_RECORDED_NOT_COMMITTED",
      scopeRef: envelope.scopeRef,
      deliveryEnvelopeRecordId: result.recordId,
      deliveryEnvelopeId: envelope.envelopeId,
      studentVisibilityReviewRecordId: envelope.studentVisibilityReviewRecordId,
      studentVisibilityReviewId: envelope.studentVisibilityReviewId,
      artifactId: envelope.artifactId,
      requestId: envelope.requestId,
      archiveItemId: envelope.archiveItemId,
      guidanceSectionsHash: envelope.guidanceSectionsHash,
    },
    studentArchivePersistencePolicy: {
      resultStudentDeliveryEnvelopeRequired: true,
      controlledAnswerArtifactRequired: true,
      guidanceHashMatchRequired: true,
      appendOnlyCommandLogRequired: true,
      safeGuidanceOnlyRequired: true,
      studentOwnScopeRequired: true,
      futureDurableArchiveCommitReviewRequired: true,
      directDatabaseAccessAllowed: false,
      mainDatabaseWriteAllowed: false,
      studentArchiveWriteAllowed: false,
      durableArchiveCommitAllowed: false,
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
      "evidence:student-delivery-envelope:student-app-ai-tutor-result-student-delivery-envelope",
      "evidence:controlled-answer-artifact:student-app-ai-tutor-controlled-answer-artifact",
    ],
    idempotencyKey: "student-app-ai-tutor-result-archive-persistence:ai_tutor_result_delivery_env_001",
  };
}

function guidanceHashMatch(deliveryReport, artifactReport) {
  const expected = deliveryReport.runtimeProbes?.studentAppAiTutorResultStudentDeliveryEnvelope?.result?.studentResultDeliveryEnvelope?.guidanceSectionsHash;
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
  return { targetP99Ms: 50, p99Ms: 999, totalErrors: 1, operations: 0, evidenceClass: "JS_AI_TUTOR_RESULT_STUDENT_ARCHIVE_PERSISTENCE_COMMAND_PROBE" };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : defaultOutPath;
  const report = auditStudentAppAITutorResultStudentArchivePersistenceCommand(loadCurrentInputs());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorResultStudentArchivePersistenceCommandAudit(report));
  if (report.readiness !== "READY") process.exit(1);
}
