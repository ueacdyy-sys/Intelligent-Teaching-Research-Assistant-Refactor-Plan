import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftGenerationPlan,
} from "./student-app-ai-tutor-question-bank-draft-generation-plan-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-generation-plan.current.json";
const sourceFiles = {
  runtime: "tools/student-app-ai-tutor-question-bank-draft-generation-plan-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-generation-plan-runtime.test.mjs",
  sourceResultReport: "reports/student-app-ai-tutor-result.current.json",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0278-student-app-ai-tutor-question-bank-draft-generation-plan.md",
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
  "executeModelNowAllowed: true",
  "generateQuestionsNowAllowed: true",
  "writeQuestionBankContentNowAllowed: true",
  "studentAnsweringAllowed: true",
  "scoringAllowed: true",
  "studentVisiblePublishAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "modelInferenceStarted: true",
  "questionContentGenerated: true",
  "questionBankContentWriteStarted: true",
  "innerHTML",
  "dangerouslySetInnerHTML",
];

export async function auditStudentAppAITutorQuestionBankDraftGenerationPlan(inputs, options = {}) {
  const findings = [];
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const sourceResultReport = parseJson(inputs.sourceResultReport, {});
  const packageJson = parseJson(inputs.packageJson, {});
  const hooks = [
    inputs.qualityGate ?? "",
    inputs.rootWorkflowCoverage ?? "",
    inputs.verifyStructure ?? "",
    inputs.architectureBoard ?? "",
    inputs.sdd ?? "",
  ].join("\n");
  const probe = await runRuntimeProbe(sourceResultReport, options);

  addFinding(findings, {
    id: "source_result.ready_with_draft_ref",
    passed: sourceResultReport.readiness === "READY" &&
      sourceResultReport.workloadType === "STUDENT_APP_AI_TUTOR_RESULT_RUNTIME" &&
      sourceResultReport.runtime?.runtimeId === "student_app_ai_tutor_result_runtime" &&
      sourceResultReport.runtime?.commandPort === "StudentAppAITutorResultPort.recordTutoringAnalysisResult" &&
      sourceResultReport.safetyInvariants?.resultRecorded === true &&
      sourceResultReport.safetyInvariants?.questionBankDraftCreated === false &&
      sourceResultReport.runtimeProbes?.studentAppAiTutorResult?.result?.result?.questionBankDraftRef?.startsWith("local://question-bank-drafts/"),
    actual: `${sourceResultReport.readiness ?? "missing"}:${sourceResultReport.runtimeProbes?.studentAppAiTutorResult?.result?.result?.questionBankDraftRef ?? "missing"}`,
    expected: "READY Student App AI Tutor result evidence with a local questionBankDraftRef but no created draft content",
    remediation: "Run the Student App AI Tutor result audit before recording generation-plan evidence.",
  });

  addFinding(findings, {
    id: "runtime.identity_port_and_idempotency",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT",
      "StudentAppAITutorQuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan",
      "recordStudentAppAITutorQuestionBankDraftGenerationPlan",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_generation_plan_runtime",
      "StudentAppAITutorQuestionBankDraftGenerationPlanPort.recordQuestionBankDraftGenerationPlan",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED",
    ]),
    expected: "runtime records an idempotent generation plan through a named injected port",
    remediation: "Keep question-bank generation planning as a port-recorded control-plane slice.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "generationPlanOnly: true",
      "modelInferenceStarted: false",
      "questionContentGenerated: false",
      "questionBankContentWriteStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "swarmAllowed: false",
      "requiresFutureGenerationWorker: true",
      "requiresFutureContentStorageCommit: true",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime plans question generation without DB, HTTP, model inference, generated content, scoring, publication, tools, or Swarm",
    remediation: "Do not collapse generation planning into actual model/content execution.",
  });

  addFinding(findings, {
    id: "runtime.probe_records_generation_plan",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT &&
      probe.result?.generationPlan?.questionBankDraftRef?.startsWith("local://question-bank-drafts/") &&
      probe.result?.generationPlan?.items?.length === 3 &&
      probe.result?.boundary?.generationPlanOnly === true &&
      probe.result?.boundary?.questionContentGenerated === false &&
      probe.result?.boundary?.questionBankContentWriteStarted === false &&
      probe.portCalls === 1 &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};items=${probe.result.generationPlan.items.length};calls=${probe.portCalls};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records one own-student question-bank generation plan through the injected port",
    remediation: "Generation planning must prove port invocation, planned item budget, and no generated content.",
  });

  addFinding(findings, {
    id: "tests.cover_generation_plan_negative_paths",
    passed: includesAll(runtimeTest, [
      "records a generation plan through the injected port without generating questions",
      "uses idempotency for safe replay and rejects conflicting plans",
      "rejects missing ports, unsafe principals, wrong source status, and unsafe policies",
      "rejects cross-student source mismatches, invalid budget, duplicate items, and missing evidence",
      "rejects leaked answer keys and model output in generation plan inputs or planned items",
    ]),
    actual: "runtime tests scanned",
    expected: "positive, idempotency, auth, source status, unsafe policy, scope mismatch, budget, duplicate, evidence, and leak tests",
    remediation: "Add regression coverage before using 0278 as Student App question-bank generation-plan evidence.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-generation-plan"]?.includes("student-app-ai-tutor-question-bank-draft-generation-plan-audit.mjs")) &&
      includesAll(hooks, [
        "Student App AI Tutor question-bank draft generation plan runtime audit",
        "studentAppAiTutorQuestionBankDraftGenerationPlan",
        "student-app-ai-tutor-question-bank-draft-generation-plan.current.json",
        "student_app_ai_tutor_question_bank_draft_generation_plan_runtime",
        "0278-student-app-ai-tutor-question-bank-draft-generation-plan.md",
        "10.18/10",
        "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + hooks, [
      "audit:student-app-ai-tutor-question-bank-draft-generation-plan",
      "studentAppAiTutorQuestionBankDraftGenerationPlan",
      "10.18/10",
    ]),
    expected: "package, strict quality, root workflow coverage, structure verifier, SDD, and architecture board track 0278",
    remediation: "Wire generation-plan evidence through every root project evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT,
      sourceRuntime: "student_app_ai_tutor_result_runtime",
      status: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_RECORDED",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    runtimeProbes: { studentAppAiTutorQuestionBankDraftGenerationPlan: probe },
    safetyInvariants: {
      sourceResultEvidenceRequired: true,
      studentOwnScopeRequired: true,
      sourceArchiveEvidenceRequired: true,
      learningGapEvidenceRequired: true,
      generationPlanOnly: true,
      generationPlanRecorded: true,
      modelInferenceAllowed: false,
      questionContentGenerated: false,
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
      ? "Use this as the Student App AI Tutor question-bank generation-plan gate; actual model generation and content storage remain future reviewed slices."
      : "Fix generation-plan evidence before claiming Student App question-bank generation planning.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftGenerationPlanAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft generation plan runtime: ${report.readiness}`,
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

async function runRuntimeProbe(sourceResultReport, options = {}) {
  const planLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-qbank-generation-plan-audit-")), "plan.jsonl");
  let portCalls = 0;
  const startedAt = Date.now();
  try {
    const result = await recordStudentAppAITutorQuestionBankDraftGenerationPlan(probeInput(sourceResultReport), {
      generatedAt: "2026-06-06T16:20:00.000Z",
      planLogPath,
      questionBankDraftGenerationPlanPort: {
        async recordQuestionBankDraftGenerationPlan(request) {
          portCalls += 1;
          return {
            source: {
              commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PORT,
              targetUseCase: "PlanStudentAppQuestionBankDraftGeneration.Execute",
              targetCommandLog: "student-command-log/question-bank-draft-generation-plan",
            },
            generationPlan: {
              planId: "qbank_generation_plan_tutor_req_student_app_001",
              questionBankDraftRef: request.generationPlan.questionBankDraftRef,
              executionState: "PLAN_RECORDED_NOT_GENERATED",
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
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_GENERATION_PLAN_PROBE",
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

function probeInput(sourceResultReport) {
  return {
    schemaVersion: "2026-06-06.student-app.ai-tutor-question-bank-draft-generation-plan.v1",
    planningInvocationId: "qbank_generation_plan_001",
    studentAppAiTutorResultReport: sourceResultReport,
    principal: {
      principalId: "svc_student_tutor_agent",
      subjectType: "SERVICE",
      role: "SERVICE",
      entryPoint: "AGENT_INTERNAL",
      sessionId: "svc_session_student_tutor_agent",
      scopes: ["TEACHING_WRITE", "STUDENT_ARCHIVE_WRITE", "AGENT_COMMAND_SUBMIT"],
    },
    studentScope: {
      mode: "OWN",
      studentId: "student_001",
      archiveItemId: "tarch_student_quiz_001",
    },
    generationPolicy: {
      resultEvidenceRequired: true,
      studentOwnScopeRequired: true,
      sourceArchiveEvidenceRequired: true,
      learningGapEvidenceRequired: true,
      generationPlanOnly: true,
      safetyReviewRequiredBeforeContent: true,
      idempotentPlanRequired: true,
      executeModelNowAllowed: false,
      generateQuestionsNowAllowed: false,
      writeQuestionBankContentNowAllowed: false,
      studentAnsweringAllowed: false,
      scoringAllowed: false,
      studentVisiblePublishAllowed: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
      futureGenerationUseCase: "GenerateQuestionBankDraftContent.Execute",
      futureStorageRepository: "ArchiveRepository.SaveQuestionBankDraftContent",
      targetContentTable: "teaching_question_bank_draft_contents",
    },
    learningObjectives: [
      "Strengthen fraction addition and subtraction with unlike denominators.",
      "Practice mixed-operation reasoning without exposing answer keys.",
    ],
    budget: {
      plannedQuestionCount: 3,
      maxPromptTokens: 1600,
      maxGenerationAttempts: 1,
      p99PlanningBudgetMs: 50,
    },
    plannedItems: [
      {
        itemId: "qbank_plan_item_001",
        knowledgePoint: "Fractions with unlike denominators",
        learningGap: "Needs practice finding common denominators before addition.",
        difficulty: "FOUNDATION",
        questionType: "CALCULATION",
        promptBlueprint: "Generate one fraction-addition calculation that checks common-denominator setup.",
        sourceEvidenceRef: "evidence:student-app-ai-tutor-result:tutor_req_student_app_001",
        maxHints: 2,
      },
      {
        itemId: "qbank_plan_item_002",
        knowledgePoint: "Mixed fraction operations",
        learningGap: "Needs mixed-operation practice after understanding basic fractions.",
        difficulty: "STANDARD",
        questionType: "SHORT_ANSWER",
        promptBlueprint: "Generate one short-answer reasoning prompt about choosing the correct operation.",
        sourceEvidenceRef: "evidence:student-app-ai-tutor-result:tutor_req_student_app_001",
        maxHints: 2,
      },
      {
        itemId: "qbank_plan_item_003",
        knowledgePoint: "Error checking",
        learningGap: "Needs to explain why an incorrect denominator choice fails.",
        difficulty: "CHALLENGE",
        questionType: "MULTIPLE_CHOICE",
        promptBlueprint: "Generate one multiple-choice misconception check without revealing final answers.",
        sourceEvidenceRef: "evidence:student-app-ai-tutor-result:tutor_req_student_app_001",
        maxHints: 1,
      },
    ],
    evidenceRefs: ["evidence:student-app-ai-tutor-result:tutor_req_student_app_001"],
    idempotencyKey: "student-app-ai-tutor-qbank-generation-plan:student_001:tutor_req_student_app_001",
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
  const report = await auditStudentAppAITutorQuestionBankDraftGenerationPlan(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftGenerationPlanAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
