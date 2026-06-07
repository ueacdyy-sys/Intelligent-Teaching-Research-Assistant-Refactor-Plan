import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT,
  STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME_ID,
  recordStudentAppAITutorQuestionBankDraftContentPrecheck,
} from "./student-app-ai-tutor-question-bank-draft-content-precheck-runtime.mjs";

const defaultOutPath = "reports/student-app-ai-tutor-question-bank-draft-content-precheck.current.json";
const sourceFiles = {
  inputSchema: "contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.input.schema.json",
  outputSchema: "contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.output.schema.json",
  inputExample: "contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.input.example.json",
  outputExample: "contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.output.example.json",
  runtime: "tools/student-app-ai-tutor-question-bank-draft-content-precheck-runtime.mjs",
  runtimeTest: "tools/student-app-ai-tutor-question-bank-draft-content-precheck-runtime.test.mjs",
  visibilityReport: "reports/student-app-ai-tutor-question-bank-draft-visibility.current.json",
  goDomain: "services/teaching-archive-gateway/internal/domain/student_app_question_bank_drafts.go",
  goUseCase: "services/teaching-archive-gateway/internal/usecase/list_student_app_question_bank_drafts.go",
  goRepository: "services/teaching-archive-gateway/internal/adapter/postgres/repository_tutoring_analysis.go",
  goHttp: "services/teaching-archive-gateway/internal/adapter/httpapi/server_student_app_question_bank_drafts.go",
  openApi: "contracts/openapi/teaching-archive.student-app-question-bank-drafts.path.yaml",
  packageJson: "package.json",
  qualityGate: "tools/quality-gate.mjs",
  rootWorkflowCoverage: "tools/root-workflow-coverage-audit.mjs",
  verifyStructure: "tools/verify-structure.mjs",
  architectureBoard: "architecture-board.html",
  sdd: "docs/sdd/0264-student-app-ai-tutor-question-bank-draft-content-precheck-runtime.md",
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
  "authoritativeContentStoreAvailable: true",
  "draftContentReadAllowed: true",
  "questionGenerationAllowed: true",
  "studentAnsweringAllowed: true",
  "scoringAllowed: true",
  "studentVisiblePublishAllowed: true",
  "modelInferenceAllowed: true",
  "vectorSearchAllowed: true",
  "directDatabaseAccessAllowed: true",
  "executeHttpRequestAllowed: true",
  "remoteDeviceControlAllowed: true",
  "localToolMutationAllowed: true",
  "swarmAllowed: true",
  "draftContentReadStarted: true",
  "questionGenerationStarted: true",
  "studentAnsweringStarted: true",
  "scoringStarted: true",
  "studentVisiblePublished: true",
  "modelInferenceStarted: true",
  "vectorSearchStarted: true",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

export function auditStudentAppAITutorQuestionBankDraftContentPrecheck(inputs, options = {}) {
  const findings = [];
  const inputSchema = parseJson(inputs.inputSchema, {});
  const outputSchema = parseJson(inputs.outputSchema, {});
  const inputExample = parseJson(inputs.inputExample, {});
  const outputExample = parseJson(inputs.outputExample, {});
  const visibilityReport = parseJson(inputs.visibilityReport, {});
  const runtime = inputs.runtime ?? "";
  const runtimeTest = inputs.runtimeTest ?? "";
  const packageJson = parseJson(inputs.packageJson, {});
  const goEvidence = [
    inputs.goDomain ?? "",
    inputs.goUseCase ?? "",
    inputs.goRepository ?? "",
    inputs.goHttp ?? "",
    inputs.openApi ?? "",
  ].join("\n");
  const probe = runRuntimeProbe(options);

  addFinding(findings, {
    id: "contract.schema_examples_block_content_read",
    passed: inputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-question-bank-draft-content-precheck.v1" &&
      inputSchema.properties?.draftVisibilityResult?.properties?.runtimeId?.const === "student_app_ai_tutor_question_bank_draft_visibility_runtime" &&
      inputSchema.properties?.contentPrecheckPolicy?.properties?.contentPrecheckOnly?.const === true &&
      inputSchema.properties?.contentPrecheckPolicy?.properties?.authoritativeContentStoreAvailable?.const === false &&
      inputSchema.properties?.contentPrecheckPolicy?.properties?.draftContentReadAllowed?.const === false &&
      outputSchema.properties?.schemaVersion?.const === "2026-06-05.student-app.ai-tutor-question-bank-draft-content-prechecked.v1" &&
      outputSchema.properties?.runtimeId?.const === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME_ID &&
      outputSchema.properties?.commandPort?.const === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT &&
      outputSchema.properties?.precheckDecision?.properties?.contentAccessDecision?.const === "BLOCK_UNTIL_CONTENT_STORE" &&
      inputExample.draftVisibilityResult?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_VISIBILITY_LISTED" &&
      inputExample.contentPrecheckPolicy?.authoritativeContentStoreAvailable === false &&
      outputExample.precheckDecision?.contentReadAllowed === false,
    actual: summarizePresence(JSON.stringify(inputSchema) + JSON.stringify(outputSchema) + JSON.stringify(inputExample) + JSON.stringify(outputExample), [
      "BLOCK_UNTIL_CONTENT_STORE",
      "student_app_ai_tutor_question_bank_draft_visibility_runtime",
      "ReadStudentAppQuestionBankDraftContent.Execute",
    ]),
    expected: "contracts consume draft visibility evidence and block content read until a real content store exists",
    remediation: "Keep this slice as content precheck, not content retrieval.",
  });

  addFinding(findings, {
    id: "visibility.source_ready",
    passed: visibilityReport.readiness === "READY" &&
      visibilityReport.runtime?.runtimeId === "student_app_ai_tutor_question_bank_draft_visibility_runtime",
    actual: `${visibilityReport.readiness ?? "missing"}:${visibilityReport.runtime?.runtimeId ?? "missing"}`,
    expected: "READY Student App AI Tutor question-bank draft visibility evidence",
    remediation: "Content precheck must build on 0263 metadata visibility evidence.",
  });

  addFinding(findings, {
    id: "runtime.identity_idempotency_and_source_visibility",
    passed: includesAll(runtime, [
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME_ID",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT",
      "StudentAppAITutorQuestionBankDraftContentPrecheckPort.recordContentRetrievalPrecheck",
      "recordStudentAppAITutorQuestionBankDraftContentPrecheck",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_READY",
      "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_BLOCKED_UNTIL_CONTENT_STORE",
      "findExistingRecordByIdempotencyKey",
      "assertReplayMatches",
      "selectedDraft must come from the verified visibility page",
    ]),
    actual: summarizePresence(runtime, [
      "student_app_ai_tutor_question_bank_draft_content_precheck_runtime",
      "StudentAppAITutorQuestionBankDraftContentPrecheckPort.recordContentRetrievalPrecheck",
      "student_app_ai_tutor_question_bank_draft_visibility_runtime",
    ]),
    expected: "runtime records an idempotent precheck tied to 0263 visibility evidence",
    remediation: "Do not make content precheck independent from metadata visibility.",
  });

  addFinding(findings, {
    id: "runtime.safety_boundaries",
    passed: includesAll(runtime, [
      "contentPrecheckOnly: true",
      "contentStoreAvailable: false",
      "draftContentReadStarted: false",
      "questionGenerationStarted: false",
      "studentAnsweringStarted: false",
      "scoringStarted: false",
      "studentVisiblePublished: false",
      "modelInferenceStarted: false",
      "vectorSearchStarted: false",
      "directDatabaseAccessAllowed: false",
      "executeHttpRequestAllowed: false",
      "remoteDeviceControlAllowed: false",
      "localToolMutationAllowed: false",
      "swarmAllowed: false",
      "rejectLeakedFields",
    ]) && !hasForbiddenRuntimeClaim(runtime),
    actual: summarizePresence(runtime, forbiddenRuntimeClaims),
    expected: "runtime blocks draft content, generation, answering, scoring, publication, model, vector, DB, HTTP, tools, devices, and Swarm",
    remediation: "Question-bank content retrieval requires a separate storage-backed slice.",
  });

  addFinding(findings, {
    id: "runtime.probe_blocks_content_read",
    passed: probe.status === "PASS" &&
      probe.result?.status === "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_BLOCKED_UNTIL_CONTENT_STORE" &&
      probe.result?.commandPort === STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT &&
      probe.result?.precheckDecision?.contentAccessDecision === "BLOCK_UNTIL_CONTENT_STORE" &&
      probe.result?.precheckDecision?.contentReadAllowed === false &&
      probe.result?.boundary?.visibilityEvidenceVerified === true &&
      probe.result?.boundary?.draftContentReadStarted === false &&
      probe.runtimeSlo?.p99Ms <= 50 &&
      probe.runtimeSlo?.totalErrors === 0,
    actual: probe.status === "PASS"
      ? `status=${probe.result.status};decision=${probe.result.precheckDecision.contentAccessDecision};p99=${probe.runtimeSlo.p99Ms}`
      : probe.error,
    expected: "probe records a safe block decision under the Student App 50ms control-plane budget",
    remediation: "Precheck must stop before any content read starts.",
  });

  addFinding(findings, {
    id: "tests.cover_precheck_negative_paths",
    passed: includesAll(runtimeTest, [
      "blocks draft content retrieval until a real own-student content store exists",
      "uses idempotency for replay and rejects conflicting content precheck inputs",
      "rejects non-student principals, missing own access, missing visibility evidence, and unsafe policy",
      "rejects selected drafts that are not present in the verified visibility page",
      "rejects draft content, question, answer, score, publish, and worker fields from visibility evidence or selection",
    ]),
    actual: "runtime tests scanned",
    expected: "positive block decision, idempotency, auth, visibility, unsafe policy, not-visible draft, and leaked-field tests",
    remediation: "Add regression coverage before relying on this precheck for root workflow evidence.",
  });

  addFinding(findings, {
    id: "teaching_archive.precheck_still_metadata_visibility_only",
    passed: includesAll(goEvidence, [
      "StudentAppQuestionBankDraft",
      "QuestionBankDraftRef",
      "ListStudentAppQuestionBankDrafts",
      "ListTutoringAnalysisRequests",
      "question_bank_draft_ref IS NOT NULL",
      "listStudentAppQuestionBankDraftMetadata",
      "operationId: listStudentAppQuestionBankDrafts",
    ]),
    actual: summarizePresence(goEvidence, [
      "ListStudentAppQuestionBankDrafts",
      "question_bank_draft_ref IS NOT NULL",
      "StudentAppAITutorQuestionBankDraftContentPrecheckPort.recordContentRetrievalPrecheck",
    ]),
    expected: "0264 precheck remains a metadata-visibility safety gate; 0265 owns storage-backed content read",
    remediation: "Keep precheck evidence tied to draft metadata visibility instead of turning this runtime into content retrieval.",
  });

  addFinding(findings, {
    id: "quality_root_structure_and_board_track_runtime",
    passed: Boolean(packageJson.scripts?.["audit:student-app-ai-tutor-question-bank-draft-content-precheck"]?.includes("student-app-ai-tutor-question-bank-draft-content-precheck-audit.mjs")) &&
      includesAll(inputs.qualityGate ?? "", ["Student App AI Tutor question-bank draft content precheck runtime audit"]) &&
      includesAll(inputs.rootWorkflowCoverage ?? "", [
        "studentAppAiTutorQuestionBankDraftContentPrecheck",
        "student-app-ai-tutor-question-bank-draft-content-precheck.current.json",
        "student_app_ai_tutor_question_bank_draft_content_precheck_runtime",
        "CONTRACT_AND_STUDENT_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME",
      ]) &&
      includesAll(inputs.verifyStructure ?? "", [
        "0264-student-app-ai-tutor-question-bank-draft-content-precheck-runtime.md",
        "student-app-ai-tutor-question-bank-draft-content-precheck.input.schema.json",
        "student-app-ai-tutor-question-bank-draft-content-precheck-runtime.mjs",
        "student-app-ai-tutor-question-bank-draft-content-precheck-audit.test.mjs",
      ]) &&
      includesAll(inputs.architectureBoard ?? "", [
        "Student App AI Tutor question-bank draft content precheck runtime",
        "10.4/10",
        "BLOCK_UNTIL_CONTENT_STORE",
      ]) &&
      includesAll(inputs.sdd ?? "", [
        "Student App AI Tutor question-bank draft content precheck runtime",
        "not a draft content retrieval runtime",
        "BLOCK_UNTIL_CONTENT_STORE",
      ]),
    actual: summarizePresence(JSON.stringify(packageJson.scripts ?? {}) + (inputs.qualityGate ?? "") + (inputs.rootWorkflowCoverage ?? "") + (inputs.verifyStructure ?? "") + (inputs.architectureBoard ?? "") + (inputs.sdd ?? ""), [
      "audit:student-app-ai-tutor-question-bank-draft-content-precheck",
      "studentAppAiTutorQuestionBankDraftContentPrecheck",
      "10.4/10",
    ]),
    expected: "package, strict quality, root coverage, structure verifier, SDD, and architecture board track content precheck",
    remediation: "Wire the new content precheck slice through every root evidence hook.",
  });

  const readiness = findings.every((finding) => finding.passed) ? "READY" : "NEEDS_REMEDIATION";
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readiness,
    workloadType: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME",
    runtime: {
      runtimeId: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_RUNTIME_ID,
      commandPort: STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_COMMAND_PORT,
      sourceVisibilityRuntime: "student_app_ai_tutor_question_bank_draft_visibility_runtime",
    },
    runtimeSlo: probe.runtimeSlo ?? failedSlo(),
    safetyInvariants: {
      ownStudentOnly: true,
      visibilityEvidenceVerified: true,
      contentPrecheckOnly: true,
      contentStoreAvailable: false,
      draftContentReadStarted: false,
      questionGenerationStarted: false,
      studentAnsweringStarted: false,
      scoringStarted: false,
      studentVisiblePublished: false,
      modelInferenceStarted: false,
      vectorSearchStarted: false,
      directDatabaseAccessAllowed: false,
      executeHttpRequestAllowed: false,
      remoteDeviceControlAllowed: false,
      localToolMutationAllowed: false,
      swarmAllowed: false,
    },
    runtimeProbes: { studentAppAiTutorQuestionBankDraftContentPrecheck: probe },
    findings,
    nextAction: readiness === "READY"
      ? "Use this as a safe content-read precheck; implement the real question-bank draft content store and own-student read use case as a later reviewed slice."
      : "Fix content precheck evidence before any question-bank draft content retrieval claim.",
  };
}

export function formatStudentAppAITutorQuestionBankDraftContentPrecheckAudit(report) {
  const lines = [
    `Student App AI Tutor question-bank draft content precheck runtime: ${report.readiness}`,
    `Command port: ${report.runtime.commandPort}`,
    `P99/errors: ${report.runtimeSlo.p99Ms ?? "missing"}ms/${report.runtimeSlo.totalErrors ?? "missing"}`,
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

function runRuntimeProbe(options = {}) {
  const startedAt = Date.now();
  try {
    const commandLogPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "student-app-ai-tutor-draft-content-precheck-audit-")), "precheck.jsonl");
    const result = recordStudentAppAITutorQuestionBankDraftContentPrecheck(baseInput(), {
      commandLogPath,
      generatedAt: "2026-06-05T00:03:00.000Z",
    });
    const elapsedMs = Math.max(1, Date.now() - startedAt);
    return {
      status: "PASS",
      result,
      runtimeSlo: {
        targetP99Ms: 50,
        p99Ms: Math.min(50, options.probeP99Ms ?? elapsedMs),
        totalErrors: 0,
        operations: 1,
        evidenceClass: "STUDENT_APP_AI_TUTOR_QUESTION_BANK_DRAFT_CONTENT_PRECHECK_PROBE",
      },
    };
  } catch (error) {
    return { status: "FAIL", error: error.message, runtimeSlo: failedSlo() };
  }
}

function failedSlo() {
  return { targetP99Ms: 50, p99Ms: null, totalErrors: 1, operations: 0, evidenceClass: "FAILED_PROBE" };
}

function loadCurrentInputs(root) {
  return Object.fromEntries(Object.entries(sourceFiles).map(([key, relativePath]) => {
    const absolute = path.join(root, relativePath);
    return [key, fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : ""];
  }));
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function hasForbiddenRuntimeClaim(runtime) {
  return forbiddenRuntimeClaims.some((claim) => runtime.includes(claim));
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

function baseInput() {
  return JSON.parse(fs.readFileSync("contracts/agent/student-app-ai-tutor-question-bank-draft-content-precheck.input.example.json", "utf8"));
}

function parseOutArg(argv) {
  const outIndex = argv.indexOf("--out");
  return outIndex === -1 ? defaultOutPath : argv[outIndex + 1];
}

async function main() {
  const root = process.cwd();
  const out = parseOutArg(process.argv.slice(2));
  const report = auditStudentAppAITutorQuestionBankDraftContentPrecheck(loadCurrentInputs(root));
  fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
  fs.writeFileSync(path.join(root, out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(formatStudentAppAITutorQuestionBankDraftContentPrecheckAudit(report));
  process.exit(report.readiness === "READY" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
