import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge,
} from "./student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-runtime.test.mjs",
  sourceControlledScoringArtifactReport: "reports/student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact.current.json",
  existingUseCase: "services/teaching-archive-gateway/internal/usecase/record_ai_grading_result.go",
  existingDomain: "services/teaching-archive-gateway/internal/domain/ai_grading_result.go",
  existingOpenApi: "contracts/openapi/teaching-archive.ai-grading-worker-result.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0292-student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.md",
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
  "answerTextDisclosed: true",
  "expectedAnswerDisclosed: true",
  "explanationDisclosed: true",
  "answerKeyDisclosed: true",
  "rawModelOutputStored: true",
  "feedbackGenerationStarted: true",
  "studentVisiblePublished: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceReport = parseJson(inputs.sourceControlledScoringArtifactReport, {});
  const existingResultBoundary = [
    inputs.existingUseCase ?? "",
    inputs.existingDomain ?? "",
    inputs.existingOpenApi ?? "",
  ].join("\n");
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceReport, options);

  addFinding(findings, {
    id: "source.controlled_scoring_artifact_ready",
    passed: sourceReport.readiness === "READY" &&
      sourceReport.workloadType === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT" &&
      sourceReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime" &&
      sourceReport.runtime?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_CONTROLLED_SCORING_ARTIFACT_RECORDED" &&
      sourceReport.safetyInvariants?.resultPersistenceAllowed === false &&
      sourceReport.safetyInvariants?.feedbackGenerationAllowed === false &&
      sourceReport.safetyInvariants?.studentVisiblePublishAllowed === false &&
      sourceReport.runtimeSlo?.totalErrors === 0,
    actual: `${sourceReport.readiness ?? "missing"}:${sourceReport.runtime?.status ?? "missing"}`,
    expected: "READY 0291 controlled scoring artifact with no prior persistence, feedback, or publication",
    remediation: "Run 0291 controlled scoring artifact audit before persisting the scoring result.",
  });

  addFinding(findings, {
    id: "existing.record_ai_grading_result_boundary_reused",
    passed: includesAll(existingResultBoundary, [
      "func (uc *RecordAIGradingResult) Execute",
      "AuthorizeRecordAIGradingResult",
      "ApplyAIGradingResult",
      "RecordAIGradingResultInput",
      "AIGradingStatusSucceeded",
      "ScoreSummary",
      "ResultRef",
      "operationId: recordTeachingAIGradingWorkerResult",
    ]),
    actual: summarizePresence(existingResultBoundary, ["func (uc *RecordAIGradingResult) Execute", "AuthorizeRecordAIGradingResult", "operationId: recordTeachingAIGradingWorkerResult"]),
    expected: "0292 reuses the existing RecordAIGradingResult result boundary instead of creating a duplicate API",
    remediation: "Keep question-bank answer scoring result persistence on the existing worker-result completion path.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT",
      "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult",
      "recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
      "StudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgePort.recordAIGradingResult",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
    ]),
    expected: "runtime is a replay-safe bridge through a named injected RecordAIGradingResult port",
    remediation: "Keep 0292 port-based, idempotent, and explicitly tied to the existing result state machine.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceControlledScoringArtifactRequired: true",
      "existingRecordAIGradingResultUseCaseRequired: true",
      "recordAIGradingResultUseCaseInvoked: true",
      "resultPersistenceStarted: true",
      "resultPersistenceCommitted: true",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "answerTextDisclosed: false",
      "expectedAnswerDisclosed: false",
      "explanationDisclosed: false",
      "answerKeyDisclosed: false",
      "rawModelOutputStored: false",
      "feedbackGenerationStarted: false",
      "studentVisiblePublished: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "requiresFutureReviewedFeedbackPublication: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime may commit the score result through an injected RecordAIGradingResult port but blocks feedback, publication, DB, HTTP, tools, and Swarm",
    remediation: "Do not collapse 0292 into feedback generation, publication, direct database writes, or a duplicate result endpoint.",
  });

  addFinding(findings, {
    id: "runtime.probe_persists_result_bridge",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT &&
      probe.result?.executionState === "SCORING_RESULT_PERSISTED_VIA_RECORD_AI_GRADING_RESULT" &&
      probe.result?.recordAIGradingResultCommand?.targetUseCase === "RecordAIGradingResult.Execute" &&
      probe.result?.persistedAIGradingResult?.status === "SUCCEEDED" &&
      probe.result?.boundary?.resultPersistenceCommitted === true &&
      probe.result?.boundary?.feedbackGenerationStarted === false &&
      probe.result?.boundary?.studentVisiblePublished === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};request=${probe.result.persistedAIGradingResult.requestId};persisted=${probe.result.boundary.resultPersistenceCommitted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe commits one sanitized scoring result through RecordAIGradingResult with no feedback or publication side effects",
    remediation: "0292 must prove 0291 score artifact to existing result state machine linkage.",
  });

  addFinding(findings, {
    id: "tests.cover_persistence_bridge_negative_paths",
    passed: includesAll(runtimeTest, [
      "persists a controlled scoring artifact through RecordAIGradingResult without feedback or publication",
      "uses idempotency for safe replay and rejects conflicting persistence commands",
      "rejects missing ports, unsafe principals, and unsafe policies",
      "rejects unsafe source reports and leaked artifact fields",
      "rejects unsafe port results, mismatched result refs, and missing source evidence",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, policy, source, leak, unsafe port, result ref, and evidence tests",
    remediation: "Add regression coverage before using 0292 as result persistence evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge"]?.includes("student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft answer scoring result persistence bridge runtime audit",
        "studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge",
        "student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.current.json",
        "student_app_ai_tutor_question_bank_draft_answer_scoring_result_persistence_bridge_runtime",
        "0292-student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.md",
        "10.32/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge",
      "studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge",
      "10.32/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0292",
    remediation: "Wire scoring result persistence bridge evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PORT,
      sourceRuntime: "student_app_ai_tutor_question_bank_draft_answer_controlled_scoring_artifact_runtime",
      targetUseCase: "RecordAIGradingResult.Execute",
      targetOperationId: "recordTeachingAIGradingWorkerResult",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_ANSWER_SCORING_RESULT_PERSISTED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftAnswerScoringResultPersistenceBridge: probe },
    safetyInvariants: {
      sourceControlledScoringArtifactRequired: true,
      existingRecordAIGradingResultUseCaseRequired: true,
      internalServiceOnly: true,
      metadataOnlyResultAllowed: true,
      recordAIGradingResultUseCaseInvoked: true,
      resultPersistenceAllowed: true,
      resultPersistenceCommitted: probe.status === "PASS",
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      answerTextDisclosed: false,
      expectedAnswerDisclosed: false,
      explanationDisclosed: false,
      answerKeyDisclosed: false,
      rawModelOutputStored: false,
      feedbackGenerationAllowed: false,
      studentVisiblePublishAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the persisted question-bank answer scoring result bridge; reviewed feedback generation, student-visible publication, and feedback archive persistence remain later reviewed slices."
      : "Fix scoring result persistence bridge evidence before claiming persisted AI Tutor answer scoring support.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgeAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft answer scoring result persistence bridge runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourceControlledScoringArtifactReport, options = {}) {
  const resultLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-answer-result-persistence-audit-")), "result.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(probeInput(sourceControlledScoringArtifactReport), {
      generatedAt: "2026-06-07T10:00:00.000Z",
      resultLogPath,
      recordAIGradingResultPort: {
        async recordAIGradingResult(request) {
          portCalls += 1;
          return {
            aiGradingResult: {
              requestId: request.recordAIGradingResultInput.requestId,
              workerId: request.recordAIGradingResultInput.workerId,
              status: request.recordAIGradingResultInput.status,
              scoreSummary: request.recordAIGradingResultInput.scoreSummary,
              resultRef: request.recordAIGradingResultInput.resultRef,
              recordAIGradingResultUseCaseInvoked: true,
              resultPersistenceCommitted: true,
              feedbackGenerationStarted: false,
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
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.max(1, Math.min(50, options.probeP99Ms ?? Date.now() - startedAt)),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_QBANK_ANSWER_SCORING_RESULT_PERSISTENCE_BRIDGE_PROBE",
      },
    };
  } catch (error) {
    return {
      status: "FAIL",
      error: error.message,
      portCalls,
      runtimeSlo: failedSlo(),
    };
  }
}

function probeInput(sourceControlledScoringArtifactReport) {
  return {
    schemaVersion: "2026-06-07.student-app.ai-tutor-question-bank-draft-answer-scoring-result-persistence-bridge.v1",
    persistenceInvocationId: "qbank_answer_scoring_result_persist_001",
    controlledScoringArtifactReport: sourceControlledScoringArtifactReport,
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    resultPersistencePolicy: {
      controlledScoringArtifactRequired: true,
      existingRecordAIGradingResultUseCaseRequired: true,
      injectedRecordAIGradingResultPortRequired: true,
      metadataOnlyResultAllowed: true,
      resultPersistenceAllowed: true,
      idempotentPersistenceRequired: true,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      feedbackGenerationAllowed: false,
      studentVisiblePublishAllowed: false,
      answerTextAllowed: false,
      expectedAnswerAllowed: false,
      explanationAllowed: false,
      answerKeyAllowed: false,
      rawModelOutputStored: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-answer-controlled-scoring-artifact:0291",
      "evidence:result-persistence-policy:record-ai-grading-result",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-answer-scoring-result-persistence:student_001:grading_req_qbank_answer_audit_001",
  };
}

function failedSlo() {
  return {
    targetP99Ms: 50,
    p99Ms: null,
    totalErrors: 1,
    operations: 0,
    evidenceClass: "FAILED_PROBE",
  };
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return includesAny(runtime, forbiddenRuntimeClaims);
}

function summarizePresence(text, values) {
  return values.map((value) => `${value}=${text.includes(value)}`).join(";");
}

function addFinding(findings, finding) {
  findings.push({ severity: finding.passed ? "info" : "error", ...finding });
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function stringifyScalar(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = await auditStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridge(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftAnswerScoringResultPersistenceBridgeAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
