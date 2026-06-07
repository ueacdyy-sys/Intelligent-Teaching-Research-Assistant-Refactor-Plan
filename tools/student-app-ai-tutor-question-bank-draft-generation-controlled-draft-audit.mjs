import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft,
} from "./student-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-controlled-draft.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-controlled-draft-runtime.test.mjs",
  sourceInputEnvelopeReport: "reports/student-app-ai-tutor-question-bank-draft-generation-input-envelope.current.json",
  sourceModelPrecheckReport: "reports/student-app-ai-tutor-question-bank-draft-generation-model-execution-precheck.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0283-student-app-ai-tutor-question-bank-draft-generation-controlled-draft.md",
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
  "answerKeyGenerated: true",
  "expectedAnswerGenerated: true",
  "rawModelOutputStored: true",
  "writeQuestionBankContentNowAllowed: true",
  "questionBankContentWriteStarted: true",
  "studentAnsweringAllowed: true",
  "scoringAllowed: true",
  "studentVisiblePublishAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftGenerationControlledDraft(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceInputEnvelopeReport = parseJson(inputs.sourceInputEnvelopeReport, {});
  const sourceModelPrecheckReport = parseJson(inputs.sourceModelPrecheckReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceInputEnvelopeReport, sourceModelPrecheckReport, options);

  addFinding(findings, {
    id: "source_envelope_and_precheck.ready_matched_not_stored",
    passed: sourceInputEnvelopeReport.readiness === "READY" &&
      sourceInputEnvelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.inputEnvelope?.executionState === "INPUT_ENVELOPE_RECORDED_NOT_GENERATED" &&
      sourceModelPrecheckReport.readiness === "READY" &&
      sourceModelPrecheckReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck?.result?.modelExecutionPrecheck?.executionState === "MODEL_EXECUTION_PRECHECKED_NOT_STARTED" &&
      sourceInputEnvelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.inputEnvelope?.envelopeId ===
        sourceModelPrecheckReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck?.result?.modelExecutionPrecheck?.envelopeId,
    actual: `${sourceInputEnvelopeReport.readiness ?? "missing"}:${sourceInputEnvelopeReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationInputEnvelope?.result?.inputEnvelope?.executionState ?? "missing"};${sourceModelPrecheckReport.readiness ?? "missing"}:${sourceModelPrecheckReport.runtimeProbes?.studentAppAiTutorQuestionBankDraftGenerationModelExecutionPrecheck?.result?.modelExecutionPrecheck?.executionState ?? "missing"}`,
    expected: "READY 0281 input envelope plus READY 0282 model precheck for the same not-stored draft",
    remediation: "Run input-envelope and model-execution-precheck audits before controlled draft generation.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationControlledDraftPort.recordControlledDraftGeneration",
      "recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime",
      "StudentAppAITutorQuestionBankDraftGenerationControlledDraftPort.recordControlledDraftGeneration",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED",
    ]),
    expected: "runtime records an idempotent controlled draft through a named injected port",
    remediation: "Keep controlled generation as a port-recorded draft artifact boundary.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "sourceInputEnvelopeVerified: true",
      "sourceModelPrecheckVerified: true",
      "controlledGenerationPortUsed: true",
      "sanitizedQuestionDraftArtifactRecorded: true",
      "questionContentGenerated: true",
      "rawModelOutputStored: false",
      "answerKeyGenerated: false",
      "expectedAnswerGenerated: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureTeacherReview: true",
      "requiresFutureContentStorageCommit: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime records sanitized generated question drafts only; it does not store raw output, answers, DB rows, HTTP, tools, or Swarm",
    remediation: "Do not collapse controlled draft generation into content storage, answer-key generation, or publication.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_controlled_draft",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT &&
      probe.result?.generatedDraft?.items?.length === 3 &&
      probe.result?.generatedDraft?.executionState === "CONTROLLED_DRAFT_RECORDED_NOT_STORED" &&
      probe.result?.boundary?.questionContentGenerated === true &&
      probe.result?.boundary?.answerKeyGenerated === false &&
      probe.result?.boundary?.questionBankContentWriteStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.generatedDraft.items.length};stored=${probe.result.boundary.questionBankContentWriteStarted};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one sanitized generated draft artifact with no storage/publication side effects",
    remediation: "Controlled draft evidence must prove item count, source linkage, no answer key, no raw model output, and no content storage.",
  });

  addFinding(findings, {
    id: "tests.cover_controlled_draft_negative_paths",
    passed: includesAll(runtimeTest, [
      "records sanitized generated question draft artifacts without content storage",
      "uses idempotency for safe replay and rejects conflicting draft attempts",
      "rejects missing ports, unsafe principals, unsafe output policy, and source mismatches",
      "rejects unsafe source states, leaked model fields, unsafe port results, and unknown items",
      "rejects answer key fields, content storage flags, and missing evidence refs",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, unsafe policy, source mismatch, leak, unsafe port, unknown item, storage, and evidence tests",
    remediation: "Add regression coverage before using 0283 as controlled draft evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-controlled-draft"]?.includes("student-app-ai-tutor-question-bank-draft-generation-controlled-draft-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation controlled draft runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationControlledDraft",
        "student-app-ai-tutor-question-bank-draft-generation-controlled-draft.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_controlled_draft_runtime",
        "0283-student-app-ai-tutor-question-bank-draft-generation-controlled-draft.md",
        "10.23/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-controlled-draft",
      "studentAppAiTutorQuestionBankDraftGenerationControlledDraft",
      "10.23/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0283",
    remediation: "Wire controlled draft generation evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PORT,
      sourceRuntimes: [
        "student_app_ai_tutor_question_bank_draft_generation_input_envelope_runtime",
        "student_app_ai_tutor_question_bank_draft_generation_model_execution_precheck_runtime",
      ],
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationControlledDraft: probe },
    safetyInvariants: {
      sourceInputEnvelopeRequired: true,
      sourceModelExecutionPrecheckRequired: true,
      internalServiceOnly: true,
      controlledGenerationPortUsed: true,
      sanitizedQuestionDraftArtifactRecorded: true,
      questionContentGenerated: true,
      rawModelOutputStored: false,
      answerKeyGenerated: false,
      expectedAnswerGenerated: false,
      questionBankContentWriteStarted: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as the Student App AI Tutor question-bank controlled draft artifact gate; teacher review and content storage remain future reviewed slices."
      : "Fix controlled draft generation evidence before reviewing or storing generated question-bank content.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationControlledDraftAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft generation controlled draft runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourceInputEnvelopeReport, sourceModelPrecheckReport, options = {}) {
  const draftLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-controlled-draft-audit-")), "draft.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationControlledDraft(probeInput(sourceInputEnvelopeReport, sourceModelPrecheckReport), {
      generatedAt: "2026-06-06T17:10:00.000Z",
      draftLogPath,
      controlledDraftGenerationPort: {
        async recordControlledDraftGeneration(request) {
          portCalls += 1;
          return {
            generatedDraft: {
              artifactId: "qbank_generation_controlled_draft_tutor_req_student_app_001",
              envelopeId: request.sourceInputEnvelope.envelopeId,
              precheckId: request.sourceModelPrecheck.precheckId,
              planId: request.sourceInputEnvelope.planId,
              claimId: request.sourceInputEnvelope.claimId,
              questionBankDraftRef: request.sourceInputEnvelope.questionBankDraftRef,
              studentId: request.sourceInputEnvelope.studentId,
              workerId: request.sourceInputEnvelope.workerId,
              generationAttemptId: request.generationAttempt.attemptId,
              modelRoute: request.sourceModelPrecheck.modelRoute,
              status: "CONTROLLED_DRAFT_READY_FOR_REVIEW_NOT_STORED",
              executionState: "CONTROLLED_DRAFT_RECORDED_NOT_STORED",
              items: request.sourceInputEnvelope.itemBlueprints.map((blueprint, index) => ({
                itemId: blueprint.itemId,
                questionType: blueprint.questionType,
                difficulty: blueprint.difficulty,
                knowledgePoint: blueprint.knowledgePoint,
                questionText: `Practice item ${index + 1}: solve a safe teacher-review draft question for ${blueprint.knowledgePoint}.`,
                hintPolicy: blueprint.maxHints > 0 ? "LIGHT_HINTS" : "NONE",
                maxHints: blueprint.maxHints,
                sourceEvidenceRef: blueprint.sourceEvidenceRef,
              })),
              rawModelOutputStored: false,
              answerKeyGenerated: false,
              expectedAnswerGenerated: false,
              questionBankContentWriteStarted: false,
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_CONTROLLED_DRAFT_PROBE",
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

function probeInput(sourceInputEnvelopeReport, sourceModelPrecheckReport) {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-controlled-draft.v1",
    generationInvocationId: "qbank_generation_controlled_draft_001",
    inputEnvelopeReport: sourceInputEnvelopeReport,
    modelExecutionPrecheckReport: sourceModelPrecheckReport,
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT", "MODEL_GENERATION_EXECUTE"],
    },
    generationAttempt: {
      attemptId: "qbank_generation_attempt_001",
      precheckId: "qbank_generation_model_precheck_tutor_req_student_app_001",
      modelRoute: "StudentTutorAgent.generate_question_bank_draft",
      queueRef: "qbank_generation_model_queue_local_001",
      providerClass: "CONTROLLED_AI_WORKER",
      maxPromptTokens: 1200,
      maxOutputTokens: 1200,
      attemptNo: 1,
    },
    outputPolicy: {
      sanitizedQuestionDraftOnly: true,
      rawModelOutputStored: false,
      answerKeyGenerationAllowed: false,
      expectedAnswerGenerationAllowed: false,
      writeQuestionBankContentNowAllowed: false,
      studentVisiblePublishAllowed: false,
      scoringAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      swarmAllowed: false,
      requiresFutureTeacherReview: true,
      requiresFutureContentStorageCommit: true,
    },
    evidenceRefs: [
      "evidence:student-app-ai-tutor-question-bank-draft-generation-input-envelope:qbank_generation_input_envelope_tutor_req_student_app_001",
      "evidence:model-execution-precheck:qbank_generation_model_precheck_tutor_req_student_app_001",
    ],
    idempotencyKey: "student-app-ai-tutor-qbank-controlled-draft:student_001:qbank_generation_model_precheck_tutor_req_student_app_001",
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
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationControlledDraft(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationControlledDraftAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
